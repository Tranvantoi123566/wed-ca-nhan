/**
 * LIÊN QUÂN 3D - ARENA OF VALOR MINI
 * Core 3D Engine & Game Logic with Three.js
 */

// --- GLOBAL GAME STATE ---
const GAME = {
    running: false,
    time: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    blueScore: 0,
    redScore: 0,
    lastMinionWave: 0,
    minionWaveInterval: 22, // seconds
    lastGoldTick: 0,
    entities: [],
    projectiles: [],
    particles: [],
    bushes: [],
    audioReady: false
};

// Canvas & Three.js instances
let scene, camera, renderer;
let clock;
let player, enemyBot, playerTower, enemyTower, playerNexus, enemyNexus, redGolem;
let minimapCtx;
let keys = {};
let moveTarget = null;
let joystickVector = { x: 0, y: 0 };
let currentTarget = null;

// --- INITIALIZE GAME ---
window.addEventListener('DOMContentLoaded', () => {
    initMinimap();
    setupEventListeners();
    initThreeJS();
    buildWorld();
    spawnInitialEntities();
    
    clock = new THREE.Clock();
    animate();
});

// --- THREE.JS SETUP ---
function initThreeJS() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a111e);
    scene.fog = new THREE.FogExp2(0x0a111e, 0.0055);

    // Camera (Isometric MOBA perspective)
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 34, 28);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.35);
    sunLight.position.set(-30, 65, 45);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 160;
    sunLight.shadow.camera.left = -65;
    sunLight.shadow.camera.right = 65;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    scene.add(sunLight);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- HELPER: 3D HEALTH BAR BUILDER ---
function attach3DHealthBar(parentGroup, width, height, yOffset, isFriendly = false) {
    const barGroup = new THREE.Group();
    barGroup.position.set(0, yOffset, 0);

    // Background (Black/Dark Gray)
    const bgGeo = new THREE.PlaneGeometry(width, height);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.DoubleSide });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    barGroup.add(bg);

    // Fill Bar
    const fillGeo = new THREE.PlaneGeometry(width, height);
    const fillMat = new THREE.MeshBasicMaterial({ 
        color: isFriendly ? 0x22c55e : 0xef4444, 
        side: THREE.DoubleSide 
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.z = 0.01;
    barGroup.add(fill);

    parentGroup.add(barGroup);

    return {
        group: barGroup,
        fill: fill,
        width: width,
        update: function(hp, maxHp) {
            const pct = Math.max(0, Math.min(1, hp / maxHp));
            fill.scale.x = pct;
            fill.position.x = - (width * (1 - pct)) / 2;
            // Face camera orientation
            barGroup.rotation.y = camera.rotation.y;
            barGroup.rotation.x = camera.rotation.x;
        }
    };
}

// --- WORLD BUILDING ---
function buildWorld() {
    // Ground Grass Arena
    const groundGeo = new THREE.PlaneGeometry(180, 80);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0x1e3a1e, 
        roughness: 0.85, 
        metalness: 0.1 
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Main Lane Stone Path
    const laneGeo = new THREE.PlaneGeometry(150, 15);
    const laneMat = new THREE.MeshStandardMaterial({ 
        color: 0x475569, 
        roughness: 0.9,
        metalness: 0.1
    });
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.y = 0.05;
    lane.receiveShadow = true;
    scene.add(lane);

    // River
    const riverGeo = new THREE.PlaneGeometry(16, 75);
    const riverMat = new THREE.MeshStandardMaterial({ 
        color: 0x0284c7, 
        roughness: 0.2, 
        metalness: 0.6,
        transparent: true,
        opacity: 0.85
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.08, 0);
    scene.add(river);

    // Decorative Trees
    for (let i = -70; i <= 70; i += 12) {
        if (Math.abs(i) < 4) continue;
        createTree(i, -24 + (Math.sin(i) * 5));
        createTree(i, 24 + (Math.cos(i) * 5));
    }

    // Bushes (Bụi cỏ Liên Quân)
    createBush(-12, 11);
    createBush(12, -11);
    createBush(-8, -11);
    createBush(8, 11);

    // Towers & Nexus Base Cores
    playerNexus = new BaseNexus(-62, 0, 'blue');
    enemyNexus = new BaseNexus(62, 0, 'red');

    playerTower = new DefenseTower(-28, 0, 'blue');
    enemyTower = new DefenseTower(28, 0, 'red');

    // Jungle Monster Camp (Bùa Đỏ Golem)
    createJungleCamp(0, -22);
}

function createTree(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    group.add(trunk);

    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.7 });
    const cone1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 4, 7), leavesMat);
    cone1.position.y = 4;
    cone1.castShadow = true;
    group.add(cone1);

    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(2, 3.2, 7), leavesMat);
    cone2.position.y = 6;
    cone2.castShadow = true;
    group.add(cone2);

    scene.add(group);
}

function createBush(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x2e7d32, 
        roughness: 0.6,
        transparent: true,
        opacity: 0.88 
    });

    for (let i = 0; i < 5; i++) {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random() * 0.4, 6, 6), mat);
        sphere.position.set((Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 2);
        sphere.scale.y = 0.8;
        group.add(sphere);
    }

    scene.add(group);
    GAME.bushes.push({ x, z, radius: 3.5, group, mat });
}

function createJungleCamp(x, z) {
    const ringGeo = new THREE.RingGeometry(2.5, 5, 16);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xd97706, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.08, z);
    scene.add(ring);

    redGolem = new JungleGolem(x, z);
    GAME.entities.push(redGolem);
}

// --- ENTITIES: BASE NEXUS ---
class BaseNexus {
    constructor(x, z, team) {
        this.x = x;
        this.z = z;
        this.team = team;
        this.maxHp = 6000;
        this.hp = this.maxHp;
        this.isDead = false;
        this.radius = 4.5;

        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);

        // Stone Base
        const baseGeo = new THREE.CylinderGeometry(4.5, 5.2, 1.8, 12);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.y = 0.9;
        baseMesh.castShadow = true;
        this.group.add(baseMesh);

        // Giant Crystal Core
        const coreGeo = new THREE.OctahedronGeometry(2.8, 0);
        const coreColor = team === 'blue' ? 0x00d2ff : 0xff1744;
        const coreMat = new THREE.MeshStandardMaterial({
            color: coreColor,
            emissive: coreColor,
            emissiveIntensity: 0.6,
            roughness: 0.2,
            metalness: 0.8
        });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.core.position.y = 4.8;
        this.core.castShadow = true;
        this.group.add(this.core);

        // 3D Health Bar
        this.hpBar = attach3DHealthBar(this.group, 4.0, 0.45, 8.2, team === 'blue');

        scene.add(this.group);
        GAME.entities.push(this);
    }

    update(dt) {
        if (this.core) {
            this.core.rotation.y += 0.8 * dt;
            this.core.position.y = 4.8 + Math.sin(GAME.time * 2) * 0.4;
        }
        if (this.hpBar) this.hpBar.update(this.hp, this.maxHp);
    }

    takeDamage(dmg, attacker) {
        if (this.isDead) return;
        this.hp -= dmg;
        spawnCombatText(this.x, this.z, Math.round(dmg), 'phys');
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            spawnExplosion(this.x, 4, this.z, this.team === 'blue' ? 0x00d2ff : 0xff1744);
            if (this.team === 'red') {
                endGame(true);
            } else {
                endGame(false);
            }
        }
    }
}

// --- ENTITIES: DEFENSE TOWER ---
class DefenseTower {
    constructor(x, z, team) {
        this.x = x;
        this.z = z;
        this.team = team;
        this.maxHp = 3500;
        this.hp = this.maxHp;
        this.attackRange = 17;
        this.attackCooldown = 1.3;
        this.lastShot = 0;
        this.damage = 290;
        this.isDead = false;
        this.radius = 2.5;

        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);

        // Tower Pillar
        const pillarGeo = new THREE.CylinderGeometry(1.6, 2.4, 7, 8);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.y = 3.5;
        pillar.castShadow = true;
        this.group.add(pillar);

        // Floating Crystal
        const crystalGeo = new THREE.OctahedronGeometry(1.4, 0);
        const crystalColor = team === 'blue' ? 0x38bdf8 : 0xef4444;
        const crystalMat = new THREE.MeshStandardMaterial({ 
            color: crystalColor,
            emissive: crystalColor,
            emissiveIntensity: 0.6
        });
        this.crystal = new THREE.Mesh(crystalGeo, crystalMat);
        this.crystal.position.y = 8.5;
        this.group.add(this.crystal);

        // Attack Range Indicator Circle
        const rangeGeo = new THREE.RingGeometry(this.attackRange - 0.25, this.attackRange, 48);
        this.rangeMat = new THREE.MeshBasicMaterial({ 
            color: team === 'blue' ? 0x0284c7 : 0xdc2626,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.35
        });
        this.rangeMesh = new THREE.Mesh(rangeGeo, this.rangeMat);
        this.rangeMesh.rotation.x = -Math.PI / 2;
        this.rangeMesh.position.y = 0.1;
        this.group.add(this.rangeMesh);

        // 3D Health Bar
        this.hpBar = attach3DHealthBar(this.group, 3.2, 0.35, 10.5, team === 'blue');

        scene.add(this.group);
        GAME.entities.push(this);
    }

    update(dt) {
        if (this.isDead) return;
        this.crystal.rotation.y += 1.5 * dt;
        if (this.hpBar) this.hpBar.update(this.hp, this.maxHp);

        // Highlight ring if player is inside enemy tower range
        if (this.team === 'red' && player && !player.isDead) {
            const dist = Math.hypot(player.x - this.x, player.z - this.z);
            if (dist <= this.attackRange) {
                this.rangeMat.opacity = 0.7 + Math.sin(GAME.time * 8) * 0.25;
            } else {
                this.rangeMat.opacity = 0.35;
            }
        }

        // Find Target & Shoot
        if (GAME.time - this.lastShot >= this.attackCooldown) {
            const target = this.findTarget();
            if (target) {
                this.shoot(target);
                this.lastShot = GAME.time;
            }
        }
    }

    findTarget() {
        let bestTarget = null;
        let minPriority = 999;

        for (const e of GAME.entities) {
            if (e === this || e.team === this.team || e.isDead || e.team === 'neutral') continue;
            const dist = Math.hypot(e.x - this.x, e.z - this.z);
            if (dist <= this.attackRange) {
                let priority = (e instanceof Minion) ? 1 : 2;
                if (priority < minPriority) {
                    minPriority = priority;
                    bestTarget = e;
                }
            }
        }
        return bestTarget;
    }

    shoot(target) {
        GAME.projectiles.push(new Projectile({
            startX: this.x,
            startY: 8.5,
            startZ: this.z,
            target: target,
            speed: 24,
            damage: this.damage,
            color: this.team === 'blue' ? 0x38bdf8 : 0xef4444,
            attacker: this
        }));
        if (window.sounds) window.sounds.playTowerShot();
    }

    takeDamage(dmg, attacker) {
        if (this.isDead) return;
        this.hp -= dmg;
        spawnCombatText(this.x, this.z, Math.round(dmg), 'phys');
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            scene.remove(this.group);
            spawnExplosion(this.x, 4, this.z, this.team === 'blue' ? 0x0284c7 : 0xdc2626);
            showAnnouncement(this.team === 'red' ? "TRỤ ĐỊCH ĐÃ BỊ PHÁ HỦY!" : "TRỤ ĐỒNG MINH ĐÃ BỊ HẠ!");
            if (attacker && attacker.team === 'blue') {
                player.gold += 350;
                player.addExp(300);
                updateStatsHUD();
            }
        }
    }
}

// --- ENTITIES: JUNGLE GOLEM (BÙA ĐỎ) ---
class JungleGolem {
    constructor(x, z) {
        this.x = x;
        this.z = z;
        this.team = 'neutral';
        this.maxHp = 2400;
        this.hp = this.maxHp;
        this.damage = 95;
        this.radius = 2.2;
        this.isDead = false;

        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);

        // Rocky Golem Body
        const bodyGeo = new THREE.DodecahedronGeometry(1.8, 0);
        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: 0x4a5568, 
            roughness: 0.9, 
            metalness: 0.2 
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 2.2;
        body.castShadow = true;
        this.group.add(body);

        // Glowing Red Core
        const coreGeo = new THREE.SphereGeometry(0.7, 8, 8);
        const coreMat = new THREE.MeshStandardMaterial({ 
            color: 0xef4444, 
            emissive: 0xff1744, 
            emissiveIntensity: 0.8 
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(0, 2.2, 0.9);
        this.group.add(core);

        // 3D Health Bar
        this.hpBar = attach3DHealthBar(this.group, 2.6, 0.28, 4.4, false);

        scene.add(this.group);
    }

    update(dt) {
        if (this.isDead) return;
        this.group.rotation.y = Math.sin(GAME.time) * 0.3;
        if (this.hpBar) this.hpBar.update(this.hp, this.maxHp);
    }

    takeDamage(dmg, attacker) {
        if (this.isDead) return;
        this.hp -= dmg;
        spawnCombatText(this.x, this.z, Math.round(dmg), 'phys');
        
        if (attacker && Math.hypot(attacker.x - this.x, attacker.z - this.z) < 4) {
            attacker.takeDamage(35, this);
        }

        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            scene.remove(this.group);
            spawnExplosion(this.x, 2, this.z, 0xff1744);
            showAnnouncement("HẠ GỤC BÙA ĐỎ! NHẬN HIỆU ỨNG TĂNG SỨC MẠNH!");
            
            if (attacker && attacker.team === 'blue') {
                attacker.gold += 200;
                attacker.addExp(200);
                attacker.hasRedBuff = true;
                attacker.redBuffTimer = 45;
                attacker.atk += 40;
                if (window.sounds) window.sounds.playGold();
                updateStatsHUD();
            }
        }
    }
}

// --- ENTITIES: MINIONS (LÍNH) ---
class Minion {
    constructor(x, z, team, type = 'melee') {
        this.x = x;
        this.z = z;
        this.team = team;
        this.type = type;
        this.maxHp = type === 'melee' ? 950 : 650;
        this.hp = this.maxHp;
        this.speed = 4.2;
        this.damage = type === 'melee' ? 45 : 65;
        this.range = type === 'melee' ? 2.4 : 9.0;
        this.attackCooldown = 1.2;
        this.lastAttack = 0;
        this.radius = 1.0;
        this.isDead = false;

        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);

        const color = team === 'blue' ? 0x2563eb : 0xdc2626;

        // Model
        const bodyGeo = new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: color });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.7;
        body.castShadow = true;
        this.group.add(body);

        const headGeo = new THREE.SphereGeometry(0.45, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.6;
        this.group.add(head);

        // 3D Health Bar
        this.hpBar = attach3DHealthBar(this.group, 1.4, 0.18, 2.3, team === 'blue');

        scene.add(this.group);
    }

    update(dt) {
        if (this.isDead) return;
        if (this.hpBar) this.hpBar.update(this.hp, this.maxHp);

        let target = this.findTarget();

        if (target) {
            const dist = Math.hypot(target.x - this.x, target.z - this.z);
            if (dist <= this.range) {
                if (GAME.time - this.lastAttack >= this.attackCooldown) {
                    this.attack(target);
                    this.lastAttack = GAME.time;
                }
            } else {
                this.moveTo(target.x, target.z, dt);
            }
        } else {
            const destX = this.team === 'blue' ? 62 : -62;
            this.moveTo(destX, 0, dt);
        }
    }

    findTarget() {
        let nearest = null;
        let minDist = 18;

        for (const e of GAME.entities) {
            if (e === this || e.team === this.team || e.isDead || e.team === 'neutral') continue;
            const dist = Math.hypot(e.x - this.x, e.z - this.z);
            if (dist < minDist) {
                minDist = dist;
                nearest = e;
            }
        }
        return nearest;
    }

    moveTo(tx, tz, dt) {
        const dx = tx - this.x;
        const dz = tz - this.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.1) {
            this.x += (dx / dist) * this.speed * dt;
            this.z += (dz / dist) * this.speed * dt;
            this.group.position.set(this.x, 0, this.z);
            this.group.rotation.y = Math.atan2(dx, dz);
        }
    }

    attack(target) {
        if (this.type === 'melee') {
            target.takeDamage(this.damage, this);
            spawnHitSpark(target.x, 1, target.z);
        } else {
            GAME.projectiles.push(new Projectile({
                startX: this.x,
                startY: 1.5,
                startZ: this.z,
                target: target,
                speed: 16,
                damage: this.damage,
                color: this.team === 'blue' ? 0x60a5fa : 0xf87171,
                attacker: this
            }));
        }
    }

    takeDamage(dmg, attacker) {
        if (this.isDead) return;
        this.hp -= dmg;
        spawnCombatText(this.x, this.z, Math.round(dmg), 'phys');
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            scene.remove(this.group);
            spawnExplosion(this.x, 1, this.z, this.team === 'blue' ? 0x2563eb : 0xdc2626);
            if (attacker && attacker.team === 'blue') {
                player.gold += 50;
                player.addExp(60);
                if (window.sounds) window.sounds.playGold();
                updateStatsHUD();
            }
        }
    }
}

// --- HERO CLASS ---
class Hero {
    constructor(x, z, team, name = "Triệu Vân") {
        this.x = x;
        this.z = z;
        this.team = team;
        this.name = name;
        this.level = 1;
        this.exp = 0;
        this.gold = 500;
        
        // Base Stats
        this.maxHp = 3200;
        this.hp = this.maxHp;
        this.maxMana = 400;
        this.mana = this.maxMana;
        this.atk = 180;
        this.armor = 65;
        this.speed = 13.5;
        this.attackRange = 3.6;
        this.attackCooldown = 0.85;
        this.lastAttack = 0;
        this.isDead = false;
        this.radius = 1.3;

        // Buffs
        this.hasRedBuff = false;
        this.redBuffTimer = 0;
        this.items = [];

        // Skills
        this.skills = {
            1: { name: 'Long Huyết', cd: 7, lastUsed: -99, cost: 40, level: 1 },
            2: { name: 'Long Phẫn', cd: 6, lastUsed: -99, cost: 50, level: 1 },
            3: { name: 'Long Kích', cd: 16, lastUsed: -99, cost: 90, level: 1 }
        };
        this.flashCd = 60;
        this.lastFlash = -99;
        this.isRecalling = false;
        this.recallTimer = 0;

        // Visual 3D Mesh
        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);
        this.buildModel();

        // 3D Health Bar
        this.hpBar = attach3DHealthBar(this.group, 2.2, 0.24, 4.3, team === 'blue');

        scene.add(this.group);
    }

    buildModel() {
        const isPlayer = (this.team === 'blue');
        const primaryColor = isPlayer ? 0x1d4ed8 : 0xb91c1c;
        const armorColor = isPlayer ? 0x94a3b8 : 0x334155;

        // Torso Armor
        const torsoGeo = new THREE.BoxGeometry(1.2, 1.6, 0.9);
        this.torsoMat = new THREE.MeshStandardMaterial({ 
            color: primaryColor, 
            metalness: 0.5, 
            roughness: 0.4,
            transparent: true,
            opacity: 1.0 
        });
        this.torso = new THREE.Mesh(torsoGeo, this.torsoMat);
        this.torso.position.y = 1.8;
        this.torso.castShadow = true;
        this.group.add(this.torso);

        // Head & Helmet
        const headGeo = new THREE.SphereGeometry(0.55, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({ color: armorColor, metalness: 0.6 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 3.0;
        head.castShadow = true;
        this.group.add(head);

        // Helmet Plume
        const plumeGeo = new THREE.ConeGeometry(0.2, 0.8, 6);
        const plumeMat = new THREE.MeshStandardMaterial({ color: isPlayer ? 0xef4444 : 0xf59e0b });
        const plume = new THREE.Mesh(plumeGeo, plumeMat);
        plume.position.set(0, 3.6, -0.2);
        plume.rotation.x = -0.5;
        this.group.add(plume);

        // Weapon
        const lanceGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8);
        const lanceMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });
        this.weapon = new THREE.Mesh(lanceGeo, lanceMat);
        this.weapon.position.set(0.9, 2.0, 0.4);
        this.weapon.rotation.x = Math.PI / 4;
        this.group.add(this.weapon);

        // Glowing Weapon Tip
        const tipGeo = new THREE.ConeGeometry(0.22, 0.8, 8);
        const tipMat = new THREE.MeshStandardMaterial({
            color: isPlayer ? 0x38bdf8 : 0xf87171,
            emissive: isPlayer ? 0x0284c7 : 0xdc2626,
            emissiveIntensity: 0.9
        });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.y = 2.2;
        this.weapon.add(tip);

        // Cape
        const capeGeo = new THREE.PlaneGeometry(1.2, 1.8);
        const capeMat = new THREE.MeshStandardMaterial({ 
            color: isPlayer ? 0xdc2626 : 0x475569, 
            side: THREE.DoubleSide 
        });
        this.cape = new THREE.Mesh(capeGeo, capeMat);
        this.cape.position.set(0, 1.8, -0.5);
        this.cape.rotation.x = 0.25;
        this.group.add(this.cape);
    }

    update(dt) {
        if (this.isDead) return;

        // Natural Regen
        if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 14 * dt);
        if (this.mana < this.maxMana) this.mana = Math.min(this.maxMana, this.mana + 16 * dt);

        if (this.hpBar) this.hpBar.update(this.hp, this.maxHp);

        // Red Buff Timer
        if (this.hasRedBuff) {
            this.redBuffTimer -= dt;
            if (this.redBuffTimer <= 0) {
                this.hasRedBuff = false;
                this.atk -= 40;
                updateStatsHUD();
            }
        }

        // Cape Sway
        if (this.cape) {
            this.cape.rotation.x = 0.25 + Math.sin(GAME.time * 6) * 0.15;
        }

        // Recall Check
        if (this.isRecalling) {
            this.recallTimer += dt;
            if (this.recallTimer >= 4.0) {
                this.x = this.team === 'blue' ? -62 : 62;
                this.z = 0;
                this.hp = this.maxHp;
                this.mana = this.maxMana;
                this.isRecalling = false;
                this.group.position.set(this.x, 0, this.z);
                spawnTeleportBeam(this.x, this.z);
                if (window.sounds) window.sounds.playHeal();
            }
        }
    }

    move(dx, dz, dt) {
        if (this.isRecalling) this.isRecalling = false;

        const len = Math.hypot(dx, dz);
        if (len > 0.05) {
            this.x += (dx / len) * this.speed * dt;
            this.z += (dz / len) * this.speed * dt;
            
            this.x = Math.max(-75, Math.min(75, this.x));
            this.z = Math.max(-30, Math.min(30, this.z));

            this.group.position.set(this.x, 0, this.z);
            this.group.rotation.y = Math.atan2(dx, dz);
            
            this.torso.position.y = 1.8 + Math.abs(Math.sin(GAME.time * 12)) * 0.2;
        }
    }

    basicAttack(target) {
        if (GAME.time - this.lastAttack < this.attackCooldown) return;
        this.lastAttack = GAME.time;
        if (this.isRecalling) this.isRecalling = false;

        if (window.sounds) window.sounds.playAttack();

        // Thrust animation
        if (this.weapon) {
            this.weapon.position.z = 1.3;
            setTimeout(() => { if (this.weapon) this.weapon.position.z = 0.4; }, 180);
        }

        if (target) {
            const isCrit = Math.random() < 0.25;
            let rawDmg = this.atk * (isCrit ? 1.8 : 1.0);
            if (this.hasRedBuff) rawDmg += 45;

            target.takeDamage(rawDmg, this, isCrit ? 'crit' : 'phys');
            spawnHitSpark(target.x, 1.8, target.z);
        }
    }

    castSkill1() {
        const sk = this.skills[1];
        if (GAME.time - sk.lastUsed < sk.cd || this.mana < sk.cost) return false;
        
        sk.lastUsed = GAME.time;
        this.mana -= sk.cost;
        if (this.isRecalling) this.isRecalling = false;

        if (window.sounds) window.sounds.playSkill1();

        const angle = this.group.rotation.y;
        const dashDist = 8;
        this.x += Math.sin(angle) * dashDist;
        this.z += Math.cos(angle) * dashDist;
        this.x = Math.max(-75, Math.min(75, this.x));
        this.z = Math.max(-30, Math.min(30, this.z));
        this.group.position.set(this.x, 0, this.z);

        spawnDashTrail(this.x, this.z, angle);
        this.dealAoEDamage(this.x, this.z, 4.5, 340 + this.atk * 0.8, 'phys');

        return true;
    }

    castSkill2() {
        const sk = this.skills[2];
        if (GAME.time - sk.lastUsed < sk.cd || this.mana < sk.cost) return false;

        sk.lastUsed = GAME.time;
        this.mana -= sk.cost;
        if (this.isRecalling) this.isRecalling = false;

        if (window.sounds) window.sounds.playSkill2();

        const initialRot = this.group.rotation.y;
        let spinCount = 0;
        const spinInterval = setInterval(() => {
            this.group.rotation.y += 0.8;
            spinCount++;
            if (spinCount > 8) {
                clearInterval(spinInterval);
                this.group.rotation.y = initialRot;
            }
        }, 20);

        spawnWhirlwindRing(this.x, this.z);
        this.dealAoEDamage(this.x, this.z, 6.0, 380 + this.atk * 0.9, 'phys');

        return true;
    }

    castSkill3() {
        const sk = this.skills[3];
        if (GAME.time - sk.lastUsed < sk.cd || this.mana < sk.cost) return false;

        sk.lastUsed = GAME.time;
        this.mana -= sk.cost;
        if (this.isRecalling) this.isRecalling = false;

        if (window.sounds) window.sounds.playSkill3();

        const startY = this.group.position.y;
        this.group.position.y = startY + 6.0;

        setTimeout(() => {
            this.group.position.y = startY;
            spawnEarthShatter(this.x, this.z);
            this.dealAoEDamage(this.x, this.z, 7.5, 780 + this.atk * 1.5, 'true');
        }, 250);

        return true;
    }

    castFlash() {
        if (GAME.time - this.lastFlash < this.flashCd) return;
        this.lastFlash = GAME.time;
        if (this.isRecalling) this.isRecalling = false;

        if (window.sounds) window.sounds.playFlash();

        const angle = this.group.rotation.y;
        this.x += Math.sin(angle) * 12;
        this.z += Math.cos(angle) * 12;
        this.x = Math.max(-75, Math.min(75, this.x));
        this.z = Math.max(-30, Math.min(30, this.z));
        this.group.position.set(this.x, 0, this.z);
        spawnTeleportBeam(this.x, this.z);
    }

    startRecall() {
        if (this.isRecalling) return;
        this.isRecalling = true;
        this.recallTimer = 0;
        spawnTeleportBeam(this.x, this.z);
    }

    dealAoEDamage(cx, cz, radius, dmg, dmgType = 'phys') {
        for (const e of GAME.entities) {
            if (e === this || e.team === this.team || e.isDead) continue;
            const dist = Math.hypot(e.x - cx, e.z - cz);
            if (dist <= radius) {
                e.takeDamage(dmg, this, dmgType);
                spawnHitSpark(e.x, 1.5, e.z);
            }
        }
    }

    takeDamage(rawDmg, attacker, type = 'phys') {
        if (this.isDead) return;
        
        let actualDmg = rawDmg;
        if (type === 'phys') {
            actualDmg = rawDmg * (100 / (100 + this.armor));
        }

        this.hp -= actualDmg;
        spawnCombatText(this.x, this.z, Math.round(actualDmg), type);

        if (window.sounds && this === player) window.sounds.playHit();

        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            this.die(attacker);
        }
    }

    addExp(amount) {
        this.exp += amount;
        const expNeeded = this.level * 150;
        if (this.exp >= expNeeded && this.level < 15) {
            this.exp -= expNeeded;
            this.level++;
            this.maxHp += 280;
            this.hp = this.maxHp;
            this.atk += 18;
            this.armor += 8;
            if (window.sounds) window.sounds.playLevelUp();
            spawnLevelUpEffect(this.x, this.z);
            showAnnouncement("LÊN CẤP " + this.level + "!");
        }
        updateStatsHUD();
    }

    die(attacker) {
        scene.remove(this.group);
        spawnExplosion(this.x, 2, this.z, this.team === 'blue' ? 0x2563eb : 0xdc2626);

        if (this === player) {
            GAME.deaths++;
            GAME.redScore++;
            showAnnouncement("BẠN ĐÃ BỊ HẠ GỤC!");
        } else {
            GAME.kills++;
            GAME.blueScore++;
            if (GAME.kills === 1) {
                showAnnouncement("CHIẾN CÔNG ĐẦU!");
            } else {
                showAnnouncement("BẠN ĐÃ HẠ GỤC KẺ ĐỊCH!");
            }
            if (attacker && attacker.team === 'blue') {
                player.gold += 320;
                player.addExp(250);
            }
        }
        updateScoreHUD();

        setTimeout(() => {
            this.respawn();
        }, 10000);
    }

    respawn() {
        this.isDead = false;
        this.x = this.team === 'blue' ? -62 : 62;
        this.z = 0;
        this.hp = this.maxHp;
        this.mana = this.maxMana;
        this.group.position.set(this.x, 0, this.z);
        scene.add(this.group);
        spawnTeleportBeam(this.x, this.z);
        if (this === player) showAnnouncement("HỒI SINH TẠI TẾ ĐÀN!");
    }
}

// --- PROJECTILE CLASS ---
class Projectile {
    constructor(cfg) {
        this.x = cfg.startX;
        this.y = cfg.startY;
        this.z = cfg.startZ;
        this.target = cfg.target;
        this.speed = cfg.speed;
        this.damage = cfg.damage;
        this.color = cfg.color;
        this.attacker = cfg.attacker;

        const geo = new THREE.SphereGeometry(0.35, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(this.x, this.y, this.z);
        scene.add(this.mesh);
    }

    update(dt) {
        if (!this.target || this.target.isDead) {
            this.destroy();
            return false;
        }

        const tx = this.target.x;
        const ty = 1.6;
        const tz = this.target.z;

        const dx = tx - this.x;
        const dy = ty - this.y;
        const dz = tz - this.z;
        const dist = Math.hypot(dx, dy, dz);

        if (dist <= 1.2) {
            this.target.takeDamage(this.damage, this.attacker);
            spawnHitSpark(tx, ty, tz);
            this.destroy();
            return false;
        }

        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
        this.z += (dz / dist) * this.speed * dt;
        this.mesh.position.set(this.x, this.y, this.z);
        return true;
    }

    destroy() {
        scene.remove(this.mesh);
    }
}

// --- ENEMY BOT AI LOGIC ---
function updateEnemyBot(bot, dt) {
    if (bot.isDead) return;

    // 1. Retreat if critically low HP (< 28%)
    if (bot.hp / bot.maxHp < 0.28) {
        bot.move(1, 0, dt);
        return;
    }

    // 2. Target Player Hero
    const distToPlayer = Math.hypot(player.x - bot.x, player.z - bot.z);
    
    if (!player.isDead && distToPlayer <= 16) {
        const dx = player.x - bot.x;
        const dz = player.z - bot.z;
        bot.group.rotation.y = Math.atan2(dx, dz);

        // Skills
        if (distToPlayer <= 7 && GAME.time - bot.skills[1].lastUsed > bot.skills[1].cd) {
            bot.castSkill1();
        } else if (distToPlayer <= 5 && GAME.time - bot.skills[2].lastUsed > bot.skills[2].cd) {
            bot.castSkill2();
        } else if (distToPlayer <= 8 && bot.hp / bot.maxHp < 0.7 && GAME.time - bot.skills[3].lastUsed > bot.skills[3].cd) {
            bot.castSkill3();
        }

        if (distToPlayer <= bot.attackRange) {
            bot.basicAttack(player);
        } else {
            bot.move(dx, dz, dt);
        }
        return;
    }

    // 3. Farm Minions
    let nearestMinion = null;
    let minDist = 22;
    for (const e of GAME.entities) {
        if (e instanceof Minion && e.team === 'blue' && !e.isDead) {
            const d = Math.hypot(e.x - bot.x, e.z - bot.z);
            if (d < minDist) {
                minDist = d;
                nearestMinion = e;
            }
        }
    }

    if (nearestMinion) {
        const dx = nearestMinion.x - bot.x;
        const dz = nearestMinion.z - bot.z;
        if (minDist <= bot.attackRange) {
            bot.basicAttack(nearestMinion);
        } else {
            bot.move(dx, dz, dt);
        }
    } else {
        if (bot.x > 0) {
            bot.move(-1, 0, dt);
        }
    }
}

// --- MINION WAVES ---
function spawnMinionWave() {
    // Blue minions
    GAME.entities.push(new Minion(-56, -2, 'blue', 'melee'));
    GAME.entities.push(new Minion(-56, 2, 'blue', 'melee'));
    GAME.entities.push(new Minion(-60, 0, 'blue', 'ranged'));

    // Red minions
    GAME.entities.push(new Minion(56, -2, 'red', 'melee'));
    GAME.entities.push(new Minion(56, 2, 'red', 'melee'));
    GAME.entities.push(new Minion(60, 0, 'red', 'ranged'));
}

// --- VFX & PARTICLES ---
function spawnHitSpark(x, y, z) {
    for (let i = 0; i < 4; i++) {
        const p = {
            mesh: new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.15, 0.15), 
                new THREE.MeshBasicMaterial({ color: 0xffd54f })
            ),
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 5 + 2,
            vz: (Math.random() - 0.5) * 6,
            life: 0.25
        };
        p.mesh.position.set(x, y, z);
        scene.add(p.mesh);
        GAME.particles.push(p);
    }
}

function spawnExplosion(x, y, z, color = 0xffa000) {
    for (let i = 0; i < 12; i++) {
        const p = {
            mesh: new THREE.Mesh(
                new THREE.SphereGeometry(0.35, 6, 6), 
                new THREE.MeshBasicMaterial({ color: color })
            ),
            vx: (Math.random() - 0.5) * 12,
            vy: Math.random() * 8 + 1,
            vz: (Math.random() - 0.5) * 12,
            life: 0.45
        };
        p.mesh.position.set(x, y, z);
        scene.add(p.mesh);
        GAME.particles.push(p);
    }
}

function spawnDashTrail(x, z, angle) {
    const geo = new THREE.PlaneGeometry(3, 7);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x38bdf8, 
        transparent: true, 
        opacity: 0.6, 
        side: THREE.DoubleSide 
    });
    const trail = new THREE.Mesh(geo, mat);
    trail.rotation.x = -Math.PI / 2;
    trail.rotation.z = angle;
    trail.position.set(x, 0.15, z);
    scene.add(trail);

    GAME.particles.push({
        mesh: trail,
        vx: 0, vy: 0, vz: 0,
        life: 0.3,
        fade: true
    });
}

function spawnWhirlwindRing(x, z) {
    const geo = new THREE.RingGeometry(1.5, 5.5, 32);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x00e5ff, 
        transparent: true, 
        opacity: 0.8, 
        side: THREE.DoubleSide 
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.3, z);
    scene.add(ring);

    GAME.particles.push({
        mesh: ring,
        vx: 0, vy: 0, vz: 0,
        life: 0.35,
        grow: true
    });
}

function spawnEarthShatter(x, z) {
    const geo = new THREE.CircleGeometry(6.5, 24);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0xff3d00, 
        transparent: true, 
        opacity: 0.85 
    });
    const circle = new THREE.Mesh(geo, mat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(x, 0.15, z);
    scene.add(circle);

    GAME.particles.push({
        mesh: circle,
        vx: 0, vy: 0, vz: 0,
        life: 0.6,
        fade: true
    });
}

function spawnTeleportBeam(x, z) {
    const geo = new THREE.CylinderGeometry(1.2, 1.2, 14, 16);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x38bdf8, 
        transparent: true, 
        opacity: 0.6 
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(x, 7, z);
    scene.add(beam);

    GAME.particles.push({
        mesh: beam,
        vx: 0, vy: 0, vz: 0,
        life: 0.5,
        fade: true
    });
}

function spawnLevelUpEffect(x, z) {
    const geo = new THREE.CylinderGeometry(1.8, 1.8, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0xffd700, 
        transparent: true, 
        opacity: 0.7 
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(x, 8, z);
    scene.add(beam);

    GAME.particles.push({
        mesh: beam,
        vx: 0, vy: 0, vz: 0,
        life: 0.6,
        fade: true
    });
}

// --- FLOATING COMBAT TEXT ---
function spawnCombatText(x, z, text, type = 'phys') {
    const layer = document.getElementById('combat-text-layer');
    if (!layer) return;

    const div = document.createElement('div');
    div.className = `combat-text text-damage-${type}`;
    div.innerText = (type === 'crit' ? `💥 ${text}` : text);

    const pos = new THREE.Vector3(x, 2.5, z);
    pos.project(camera);

    const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

    div.style.left = `${screenX}px`;
    div.style.top = `${screenY}px`;

    layer.appendChild(div);
    setTimeout(() => { div.remove(); }, 850);
}

// --- INITIAL ENTITIES ---
function spawnInitialEntities() {
    player = new Hero(-52, 0, 'blue', 'Triệu Vân');
    enemyBot = new Hero(52, 0, 'red', 'Lữ Bố');
    GAME.entities.push(player);
    GAME.entities.push(enemyBot);

    spawnMinionWave();
    GAME.running = true;
    updateStatsHUD();
}

// --- GAME LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    if (!GAME.running) return;

    GAME.time += dt;

    // Passive Gold Tick (+3 gold / sec)
    if (GAME.time - GAME.lastGoldTick >= 1.0) {
        player.gold += 3;
        GAME.lastGoldTick = GAME.time;
        updateStatsHUD();
    }

    // Minion Wave Spawner
    if (GAME.time - GAME.lastMinionWave >= GAME.minionWaveInterval) {
        spawnMinionWave();
        GAME.lastMinionWave = GAME.time;
    }

    // Input Handling
    handlePlayerInput(dt);

    // Update Entities
    for (let i = GAME.entities.length - 1; i >= 0; i--) {
        const e = GAME.entities[i];
        if (e.update) e.update(dt);
        if (e.isDead && (e instanceof Minion)) {
            GAME.entities.splice(i, 1);
        }
    }

    // Update Bot AI
    if (enemyBot) updateEnemyBot(enemyBot, dt);

    // Update Projectiles
    for (let i = GAME.projectiles.length - 1; i >= 0; i--) {
        if (!GAME.projectiles[i].update(dt)) {
            GAME.projectiles.splice(i, 1);
        }
    }

    // Update Particles
    for (let i = GAME.particles.length - 1; i >= 0; i--) {
        const p = GAME.particles[i];
        p.life -= dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;

        if (p.fade && p.mesh.material) {
            p.mesh.material.opacity = p.life * 2;
        }
        if (p.grow) {
            p.mesh.scale.multiplyScalar(1.08);
        }

        if (p.life <= 0) {
            scene.remove(p.mesh);
            GAME.particles.splice(i, 1);
        }
    }

    // Camera follow player
    if (player && !player.isDead) {
        const targetCamX = player.x - 14;
        const targetCamZ = player.z + 20;
        camera.position.x += (targetCamX - camera.position.x) * 0.1;
        camera.position.z += (targetCamZ - camera.position.z) * 0.1;
        camera.lookAt(player.x, 1.2, player.z);
    }

    // Bush Check
    checkBushInteraction();

    // UI Updates
    updateCooldownsUI();
    updateMinimap();
    updateTimerUI();

    renderer.render(scene, camera);
}

// --- PLAYER INPUT ---
function handlePlayerInput(dt) {
    if (!player || player.isDead) return;

    let moveX = 0;
    let moveZ = 0;

    // Keys
    if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

    // Joystick
    if (Math.hypot(joystickVector.x, joystickVector.y) > 0.15) {
        moveX = joystickVector.x;
        moveZ = joystickVector.y;
    }

    // Click Target
    if (moveTarget) {
        const dx = moveTarget.x - player.x;
        const dz = moveTarget.z - player.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.4) {
            moveX = dx;
            moveZ = dz;
        } else {
            moveTarget = null;
        }
    }

    if (Math.hypot(moveX, moveZ) > 0.1) {
        player.move(moveX, moveZ, dt);
    }
}

// --- BUSH INTERACTION ---
function checkBushInteraction() {
    let inAnyBush = false;
    for (const bush of GAME.bushes) {
        const d = Math.hypot(player.x - bush.x, player.z - bush.z);
        if (d < bush.radius) {
            inAnyBush = true;
            break;
        }
    }
    if (player && player.torsoMat) {
        player.torsoMat.opacity = inAnyBush ? 0.45 : 1.0;
    }
}

// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {
    window.addEventListener('keydown', (e) => {
        keys[e.code] = true;

        if (e.code === 'KeyQ') player.castSkill1();
        if (e.code === 'KeyW') player.castSkill2();
        if (e.code === 'KeyR' || e.code === 'KeyE') player.castSkill3();
        if (e.code === 'Space' || e.code === 'KeyA') attackNearestTarget();
        if (e.code === 'KeyD') player.castFlash();
        if (e.code === 'KeyB') player.startRecall();
    });

    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('pointerdown', (e) => {
        if (e.target.tagName !== 'CANVAS') return;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        
        let clickedEnemy = null;
        for (const entity of GAME.entities) {
            if (entity.team !== 'blue' && !entity.isDead && entity.group) {
                const intersects = raycaster.intersectObjects(entity.group.children, true);
                if (intersects.length > 0) {
                    clickedEnemy = entity;
                    break;
                }
            }
        }

        if (clickedEnemy) {
            player.basicAttack(clickedEnemy);
        } else {
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const targetPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(groundPlane, targetPoint);
            if (targetPoint) {
                moveTarget = { x: targetPoint.x, z: targetPoint.z };
            }
        }
    });

    // UI Buttons
    document.getElementById('btn-attack').addEventListener('click', attackNearestTarget);
    document.getElementById('btn-skill-1').addEventListener('click', () => player.castSkill1());
    document.getElementById('btn-skill-2').addEventListener('click', () => player.castSkill2());
    document.getElementById('btn-skill-3').addEventListener('click', () => player.castSkill3());
    document.getElementById('btn-flash').addEventListener('click', () => player.castFlash());
    document.getElementById('btn-recall').addEventListener('click', () => player.startRecall());
    document.getElementById('quick-buy-btn').addEventListener('click', buyQuickItem);

    setupJoystick();
}

function attackNearestTarget() {
    if (!player || player.isDead) return;

    let nearest = null;
    let minDist = 14;

    for (const e of GAME.entities) {
        if (e.team === 'blue' || e.isDead) continue;
        const dist = Math.hypot(e.x - player.x, e.z - player.z);
        if (dist < minDist) {
            minDist = dist;
            nearest = e;
        }
    }

    if (nearest) {
        const dist = Math.hypot(nearest.x - player.x, nearest.z - player.z);
        player.group.rotation.y = Math.atan2(nearest.x - player.x, nearest.z - player.z);
        
        if (dist <= player.attackRange) {
            player.basicAttack(nearest);
        } else {
            // Step towards target
            moveTarget = { x: nearest.x, z: nearest.z };
        }
    } else {
        player.basicAttack(null);
    }
}

// --- VIRTUAL JOYSTICK ---
function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const knob = document.getElementById('joystick-knob');
    let dragging = false;
    let startX = 0, startY = 0;

    function handleStart(clientX, clientY) {
        dragging = true;
        const rect = zone.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
        moveTarget = null;
    }

    function handleMove(clientX, clientY) {
        if (!dragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;
        const dist = Math.hypot(dx, dy);
        const maxRadius = 45;

        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);

        const knobX = Math.cos(angle) * clampedDist;
        const knobY = Math.sin(angle) * clampedDist;

        knob.style.transform = `translate(${knobX}px, ${knobY}px)`;

        joystickVector.x = knobX / maxRadius;
        joystickVector.y = knobY / maxRadius;
    }

    function handleEnd() {
        dragging = false;
        knob.style.transform = `translate(0px, 0px)`;
        joystickVector = { x: 0, y: 0 };
    }

    zone.addEventListener('pointerdown', (e) => {
        handleStart(e.clientX, e.clientY);
        zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => handleMove(e.clientX, e.clientY));
    zone.addEventListener('pointerup', (e) => handleEnd());
    zone.addEventListener('pointercancel', (e) => handleEnd());
}

// --- MINIMAP RENDERING ---
function initMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    canvas.width = 150;
    canvas.height = 150;
    minimapCtx = canvas.getContext('2d');
}

function updateMinimap() {
    if (!minimapCtx) return;
    const ctx = minimapCtx;
    const w = 150, h = 150;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    // River
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(w / 2 - 8, 0, 16, h);

    // Lane
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, h / 2 - 12, w, 24);

    function toMapX(x3d) { return ((x3d + 75) / 150) * w; }
    function toMapY(z3d) { return ((z3d + 30) / 60) * h; }

    for (const e of GAME.entities) {
        if (e.isDead) continue;
        const mx = toMapX(e.x);
        const my = toMapY(e.z);

        if (e instanceof Hero) {
            ctx.beginPath();
            ctx.arc(mx, my, e === player ? 5 : 4, 0, Math.PI * 2);
            ctx.fillStyle = (e.team === 'blue') ? '#38bdf8' : '#ef4444';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        } else if (e instanceof DefenseTower || e instanceof BaseNexus) {
            ctx.fillStyle = (e.team === 'blue') ? '#2563eb' : '#dc2626';
            ctx.fillRect(mx - 4, my - 4, 8, 8);
        } else if (e instanceof Minion) {
            ctx.beginPath();
            ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = (e.team === 'blue') ? '#60a5fa' : '#f87171';
            ctx.fill();
        } else if (e instanceof JungleGolem) {
            ctx.beginPath();
            ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
        }
    }
}

// --- HUD & COOLDOWNS ---
function updateCooldownsUI() {
    if (!player) return;

    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
    const manaPct = Math.max(0, (player.mana / player.maxMana) * 100);

    document.getElementById('hp-fill').style.width = `${hpPct}%`;
    document.getElementById('mana-fill').style.width = `${manaPct}%`;
    document.getElementById('hp-text').innerText = `${Math.round(player.hp)} / ${Math.round(player.maxHp)}`;
    document.getElementById('mana-text').innerText = `${Math.round(player.mana)} / ${Math.round(player.maxMana)}`;

    for (let i = 1; i <= 3; i++) {
        const sk = player.skills[i];
        const cdEl = document.getElementById(`cd-skill-${i}`);
        const elapsed = GAME.time - sk.lastUsed;
        const remain = Math.ceil(sk.cd - elapsed);

        if (remain > 0) {
            cdEl.style.display = 'flex';
            cdEl.innerText = remain;
        } else {
            cdEl.style.display = 'none';
        }
    }

    const flashEl = document.getElementById('cd-flash');
    const flashRemain = Math.ceil(player.flashCd - (GAME.time - player.lastFlash));
    if (flashRemain > 0) {
        flashEl.style.display = 'flex';
        flashEl.innerText = flashRemain;
    } else {
        flashEl.style.display = 'none';
    }
}

function updateStatsHUD() {
    if (!player) return;
    document.getElementById('stat-level').innerText = player.level;
    document.getElementById('stat-gold').innerText = player.gold;
    document.getElementById('stat-ad').innerText = Math.round(player.atk);
    document.getElementById('stat-armor').innerText = Math.round(player.armor);
}

function updateScoreHUD() {
    document.getElementById('blue-kills').innerText = GAME.blueScore;
    document.getElementById('red-kills').innerText = GAME.redScore;
    document.getElementById('kda-score').innerText = `${GAME.kills}/${GAME.deaths}/${GAME.assists}`;
}

function updateTimerUI() {
    const mins = Math.floor(GAME.time / 60);
    const secs = Math.floor(GAME.time % 60);
    document.getElementById('game-timer').innerText = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// --- SHOP ITEMS ---
const SHOP_ITEMS = [
    { id: 'boots', name: 'Giày Kiên Cường', cost: 690, icon: '👢', ad: 0, hp: 150, armor: 45 },
    { id: 'spear', name: 'Thương Longinus', cost: 1850, icon: '🗡️', ad: 85, hp: 300, armor: 20 },
    { id: 'sword', name: 'Phức Hợp Kiếm', cost: 2150, icon: '⚔️', ad: 100, hp: 500, armor: 30 },
    { id: 'fenrir', name: 'Nanh Fenrir', cost: 2950, icon: '🔱', ad: 180, hp: 0, armor: 0 }
];
let currentItemIdx = 0;

function buyQuickItem() {
    if (!player) return;
    const item = SHOP_ITEMS[currentItemIdx];
    if (!item) return;

    if (player.gold >= item.cost) {
        player.gold -= item.cost;
        player.atk += item.ad;
        player.maxHp += item.hp;
        player.hp += item.hp;
        player.armor += item.armor;
        player.items.push(item);

        if (window.sounds) window.sounds.playBuyItem();
        showAnnouncement(`ĐÃ MUA: ${item.name}!`);

        currentItemIdx++;
        updateQuickBuyHUD();
        updateStatsHUD();
    } else {
        showAnnouncement("CHƯA ĐỦ VÀNG!");
    }
}

function updateQuickBuyHUD() {
    const item = SHOP_ITEMS[currentItemIdx];
    const box = document.getElementById('quick-buy-box');
    if (item) {
        box.style.display = 'flex';
        document.getElementById('quick-item-icon').innerText = item.icon;
        document.getElementById('quick-item-name').innerText = item.name;
        document.getElementById('quick-item-cost').innerText = `${item.cost} Vàng`;
    } else {
        box.style.display = 'none';
    }
}

// --- ANNOUNCEMENTS ---
let announceTimeout;
function showAnnouncement(text) {
    const banner = document.getElementById('announcer-banner');
    if (!banner) return;

    banner.innerText = text;
    banner.classList.add('show');

    if (window.sounds) {
        window.sounds.announce(text);
    }

    clearTimeout(announceTimeout);
    announceTimeout = setTimeout(() => {
        banner.classList.remove('show');
    }, 2800);
}

// --- END GAME MODAL ---
function endGame(isWin) {
    GAME.running = false;
    if (window.sounds) window.sounds.playFanfare(isWin);

    const modal = document.getElementById('game-modal');
    const title = document.getElementById('modal-title');
    const desc = document.getElementById('modal-desc');
    const startBtn = document.getElementById('start-btn');

    modal.style.display = 'flex';
    if (isWin) {
        title.innerText = "CHIẾN THẮNG (VICTORY)";
        title.className = "win-title";
        desc.innerText = "Chúc mừng Kiện Tướng đã phá hủy hoàn toàn Nhà Chính của địch và thống nhất chiến trường Liên Quân 3D!";
    } else {
        title.innerText = "THẤT BẠI (DEFEAT)";
        title.className = "lose-title";
        desc.innerText = "Nhà chính đồng minh đã bị phá hủy! Hãy nâng cấp kỹ năng và phục thù ở trận chiến tiếp theo.";
    }

    startBtn.innerText = "CHƠI LẠI TRẬN MỚI";
    startBtn.onclick = restartGame;
}

function restartGame() {
    window.location.reload();
}
window.restartGame = restartGame;
