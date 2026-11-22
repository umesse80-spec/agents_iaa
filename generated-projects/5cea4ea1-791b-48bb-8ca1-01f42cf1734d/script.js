// --- DEVELOPER AGENT : FPS 3D TACTICAL ARENA ---

// Variables Globales du Moteur
let scene, camera, renderer, controls;
let clock = new THREE.Clock();
let audioCtx = null;

// Contrôles Joueur
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

// Statistiques Joueur & Arme
let playerHP = 100;
let maxPlayerHP = 100;
let ammoCurrent = 30;
let ammoReserve = 90;
let isReloading = false;
let killCount = 0;
let canShoot = true;
let shootCooldown = 0.12; // Cadence de tir AK-47
let shootTimer = 0;

// Objets & Collisions
let colliders = [];
let bulletDecals = [];

// Bot Ennemi
let bot = null;
let botHP = 100;
let maxBotHP = 100;
let botState = 'patrol'; // 'patrol', 'chase', 'attack', 'dead'
let botTargetPosition = new THREE.Vector3();
let botShootTimer = 0;

// Arme Joueur (AK-47)
let weaponMesh, muzzleFlash;
let gunGroup = new THREE.Group();

// Initialisation au chargement
window.addEventListener('load', () => {
    init();
    animate();
});

function init() {
    // 1. Scène, Caméra, Renderer
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1016);
    scene.fog = new THREE.FogExp2(0x0f1016, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Contrôles PointerLock
    controls = new THREE.PointerLockControls(camera, document.body);
    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');
    const hud = document.getElementById('hud');

    instructions.addEventListener('click', () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        controls.lock();
    });

    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
        hud.style.display = 'block';
    });

    controls.addEventListener('unlock', () => {
        if (playerHP > 0 && botHP > 0) {
            blocker.style.display = 'flex';
        }
        hud.style.display = 'none';
    });

    // Éclairage
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 40;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // 2. Environnement & Arène
    createArena();

    // 4. Arme (AK-47)
    createAK47();

    // 5. Bot Ennemi
    spawnBot();

    // Écouteurs Clavier / Souris
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onWindowResize);

    document.getElementById('restart-btn').addEventListener('click', restartGame);
}

// Création de l'Arène et des Obstacles
function createArena() {
    // Sol
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a24, 
        roughness: 0.8,
        metalness: 0.2 
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grille au sol esthétique
    const grid = new THREE.GridHelper(80, 40, 0x00ffcc, 0x333344);
    grid.position.y = 0.01;
    scene.add(grid);

    // Murs d'enceinte
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.7 });
    
    createWall(0, 5, -40, 80, 10, 2, wallMat); // Nord
    createWall(0, 5, 40, 80, 10, 2, wallMat);  // Sud
    createWall(-40, 5, 0, 2, 10, 80, wallMat); // Ouest
    createWall(40, 5, 0, 2, 10, 80, wallMat);  // Est

    // Obstacles intérieurs (Caisses et Blocs de Béton)
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x4a4e69, roughness: 0.5 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6c757d, roughness: 0.9 });

    createObstacle(-10, 2, -10, 4, 4, 4, boxMat);
    createObstacle(15, 3, -15, 6, 6, 3, concreteMat);
    createObstacle(-15, 1.5, 15, 5, 3, 5, boxMat);
    createObstacle(12, 2.5, 12, 4, 5, 4, concreteMat);
    createObstacle(0, 2, -25, 10, 4, 2, concreteMat);
    createObstacle(-25, 2, 0, 2, 4, 10, boxMat);
    createObstacle(25, 2, 0, 2, 4, 10, boxMat);
}

function createWall(x, y, z, w, h, d, material) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Collider Box
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
}

function createObstacle(x, y, z, w, h, d, material) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
}

// Assemblage de l'AK-47 3D attaché à la caméra
function createAK47() {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 });

    // Corps AK
    const bodyGeo = new THREE.BoxGeometry(0.12, 0.15, 0.9);
    const body = new THREE.Mesh(bodyGeo, metalMat);
    gunGroup.add(body);

    // Canon
    const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.7);
    gunGroup.add(barrel);

    // Crosse en bois
    const stockGeo = new THREE.BoxGeometry(0.1, 0.18, 0.5);
    const stock = new THREE.Mesh(stockGeo, woodMat);
    stock.position.set(0, -0.05, 0.6);
    stock.rotation.x = -0.1;
    gunGroup.add(stock);

    // Garde-main en bois
    const handguardGeo = new THREE.BoxGeometry(0.14, 0.14, 0.4);
    const handguard = new THREE.Mesh(handguardGeo, woodMat);
    handguard.position.set(0, -0.02, -0.3);
    gunGroup.add(handguard);

    // Chargeur courbé typique AK
    const magGeo = new THREE.BoxGeometry(0.09, 0.4, 0.15);
    const magazine = new THREE.Mesh(magGeo, metalMat);
    magazine.position.set(0, -0.25, -0.15);
    magazine.rotation.x = 0.3;
    gunGroup.add(magazine);

    // Flash lumineux (Bouche de feu)
    const flashGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    muzzleFlash.position.set(0, 0.04, -1.1);
    muzzleFlash.visible = false;
    gunGroup.add(muzzleFlash);

    // Positionnement relatif à la caméra FPS
    gunGroup.position.set(0.25, -0.22, -0.55);
    camera.add(gunGroup);
    scene.add(camera);
}

// 5. Bot Ennemi Intelligent
function spawnBot() {
    const botGroup = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.5 });
    const limbsMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });

    // Torse
    const torsoGeo = new THREE.BoxGeometry(0.8, 1.2, 0.5);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.2;
    torso.castShadow = true;
    botGroup.add(torso);

    // Tête
    const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xffdbac }));
    head.position.y = 2.0;
    head.castShadow = true;
    botGroup.add(head);

    // Arme du Bot
    const botGunGeo = new THREE.BoxGeometry(0.1, 0.1, 0.8);
    const botGun = new THREE.Mesh(botGunGeo, limbsMat);
    botGun.position.set(0.4, 1.1, -0.4);
    botGroup.add(botGun);

    botGroup.position.set(0, 0, -20);
    scene.add(botGroup);

    bot = {
        mesh: botGroup,
        position: botGroup.position,
        velocity: new THREE.Vector3(),
        speed: 3.5,
        visionRange: 25,
        attackRange: 15
    };
}

// Contrôles Clavier
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyZ': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyQ': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space':
            if (canJump) {
                velocity.y += 8;
                canJump = false;
            }
            break;
        case 'KeyR':
            reloadWeapon();
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyZ': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyQ': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Gestion des tirs du Joueur
function onMouseDown(event) {
    if (controls.isLocked && event.button === 0) {
        shootWeapon();
    }
}

function shootWeapon() {
    if (!canShoot || isReloading) return;

    if (ammoCurrent <= 0) {
        playSound('empty');
        return;
    }

    ammoCurrent--;
    updateHUD();
    canShoot = false;
    setTimeout(() => { canShoot = true; }, shootCooldown * 1000);

    // Son & Effets Visuels AK-47
    playSound('shot');
    muzzleFlash.visible = true;
    setTimeout(() => { muzzleFlash.visible = false; }, 50);

    // Recul de l'arme
    gunGroup.position.z += 0.08;
    setTimeout(() => { gunGroup.position.z -= 0.08; }, 80);

    // Raycasting pour impact
    const raycaster = new THREE.Raycaster();
    const centerScreen = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(centerScreen, camera);

    // Vérifier impact sur le bot
    if (bot && botState !== 'dead') {
        const botParts = bot.mesh.children;
        const intersects = raycaster.intersectObjects(botParts, true);

        if (intersects.length > 0) {
            const hitDistance = intersects[0].distance;
            // Vérifier que le tir n'est pas bloqué par un mur
            let blockedByWall = false;
            for (let collider of colliders) {
                const wallIntersect = raycaster.ray.intersectBox(collider, new THREE.Vector3());
                if (wallIntersect && raycaster.ray.origin.distanceTo(wallIntersect) < hitDistance) {
                    blockedByWall = true;
                    break;
                }
            }

            if (!blockedByWall) {
                const damage = Math.floor(Math.random() * 10) + 20; // 20-30 dégâts
                botHP -= damage;
                showDamageIndicator(intersects[0].point, damage);
                updateHUD();

                if (botHP <= 0) {
                    killBot();
                }
            }
        }
    }
}

function reloadWeapon() {
    if (isReloading || ammoCurrent === 30 || ammoReserve <= 0) return;

    isReloading = true;
    playSound('reload');

    setTimeout(() => {
        const needed = 30 - ammoCurrent;
        const toReload = Math.min(needed, ammoReserve);
        ammoCurrent += toReload;
        ammoReserve -= toReload;
        isReloading = false;
        updateHUD();
    }, 1500);
}

// Intelligence Artificielle du Bot
function updateBot(delta) {
    if (!bot || botState === 'dead') return;

    const botPos = bot.position;
    const playerPos = camera.position;
    const distanceToPlayer = botPos.distanceTo(playerPos);

    // Rotation du bot vers le joueur
    bot.mesh.lookAt(playerPos.x, botPos.y, playerPos.z);

    // Machine à états simple
    if (distanceToPlayer < bot.visionRange) {
        if (distanceToPlayer > 8) {
            botState = 'chase';
            // Avancer vers le joueur en contournant grossièrement
            const dir = new THREE.Vector3().subVectors(playerPos, botPos).normalize();
            botPos.addScaledVector(dir, bot.speed * delta);
            
            // Collision basique avec les murs pour le bot
            checkBotCollisions();
        } else {
            botState = 'attack';
            botShootTimer += delta;
            if (botShootTimer > 1.2) {
                botShootTimer = 0;
                botShootAtPlayer();
            }
        }
    } else {
        botState = 'patrol';
        // Patrouille simple aller-retour
        botPos.z += Math.sin(Date.now() * 0.001) * 0.02;
    }
}

function checkBotCollisions() {
    const botBox = new THREE.Box3().setFromObject(bot.mesh);
    for (let collider of colliders) {
        if (botBox.intersectsBox(collider)) {
            // Recul simple si collision
            bot.position.z += 0.1;
        }
    }
}

function botShootAtPlayer() {
    playSound('enemy_shot');
    const damage = Math.floor(Math.random() * 10) + 10; // 10-20 dégâts
    playerHP -= damage;
    updateHUD();

    // Effet flash écran dégâts
    const dmgIndicator = document.getElementById('damage-indicator');
    dmgIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
    setTimeout(() => { dmgIndicator.style.backgroundColor = 'transparent'; }, 150);

    if (playerHP <= 0) {
        gameOver(false);
    }
}

function killBot() {
    botState = 'dead';
    killCount++;
    updateHUD();

    // Animation de mort (chute du bot)
    let rotAngle = 0;
    const deathAnim = setInterval(() => {
        rotAngle += 0.1;
        bot.mesh.rotation.x = rotAngle;
        bot.mesh.position.y -= 0.05;
        if (rotAngle >= Math.PI / 2) {
            clearInterval(deathAnim);
            setTimeout(() => {
                gameOver(true);
            }, 1000);
        }
    }, 30);
}

// Affichage Dégâts Flottants 3D -> 2D
function showDamageIndicator(worldPos, damage) {
    const tempVector = worldPos.clone();
    tempVector.project(camera);

    const x = (tempVector.x *  .5 + .5) * window.innerWidth;
    const y = (tempVector.y * -.5 + .5) * window.innerHeight;

    const dmgDiv = document.createElement('div');
    dmgDiv.className = 'floating-dmg';
    dmgDiv.innerText = `-${damage}`;
    dmgDiv.style.left = `${x}px`;
    dmgDiv.style.top = `${y}px`;
    document.body.appendChild(dmgDiv);

    setTimeout(() => {
        dmgDiv.remove();
    }, 800);
}

// Gestion Audio Synthétisée (Web Audio API)
function playSound(type) {
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'shot') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'enemy_shot') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'empty') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'reload') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(450, now + 0.5);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    }
}

// Mise à jour de l'UI HUD
function updateHUD() {
    document.getElementById('player-hp').innerText = Math.max(0, playerHP);
    document.getElementById('player-hp-bar').style.width = `${Math.max(0, (playerHP / maxPlayerHP) * 100)}%`;
    
    document.getElementById('enemy-hp').innerText = Math.max(0, botHP);
    document.getElementById('enemy-hp-bar').style.width = `${Math.max(0, (botHP / maxBotHP) * 100)}%`;

    document.getElementById('ammo-current').innerText = ammoCurrent;
    document.getElementById('ammo-reserve').innerText = ammoReserve;
    document.getElementById('kill-count').innerText = killCount;
}

// Fin de partie
function gameOver(isVictory) {
    controls.unlock();
    const screen = document.getElementById('game-over-screen');
    const title = document.getElementById('game-over-title');
    const text = document.getElementById('game-over-text');

    screen.style.display = 'flex';
    if (isVictory) {
        title.innerText = "VICTOIRE";
        title.style.color = "#00ffcc";
        text.innerText = "Vous avez éliminé le bot ennemi !";
    } else {
        title.innerText = "DÉFAITE";
        title.style.color = "#ff3333";
        text.innerText = "Vous avez été éliminé par le bot.";
    }
}

function restartGame() {
    playerHP = 100;
    botHP = 100;
    ammoCurrent = 30;
    ammoReserve = 90;
    isReloading = false;
    botState = 'patrol';
    
    if (bot) {
        bot.position.set(0, 0, -20);
        bot.mesh.rotation.set(0, 0, 0);
    }

    camera.position.set(0, 1.6, 10);
    updateHUD();

    document.getElementById('game-over-screen').style.display = 'none';
    controls.lock();
}

// Boucle Principale d'Animation (60 FPS)
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (controls.isLocked) {
        // Gravité et Déplacements Joueur
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 3.0 * delta; // Gravité

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 40.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 40.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        camera.position.y += (velocity.y * delta);

        // Collision sol
        if (camera.position.y < 1.6) {
            velocity.y = 0;
            camera.position.y = 1.6;
            canJump = true;
        }

        // Collisions strictes avec les obstacles de l'arène
        const playerBox = new THREE.Box3(
            new THREE.Vector3(camera.position.x - 0.4, camera.position.y - 1.6, camera.position.z - 0.4),
            new THREE.Vector3(camera.position.x + 0.4, camera.position.y + 0.4, camera.position.z + 0.4)
        );

        for (let collider of colliders) {
            if (playerBox.intersectsBox(collider)) {
                // Repousser le joueur hors de l'obstacle
                controls.moveRight(velocity.x * delta * 1.5);
                controls.moveForward(velocity.z * delta * 1.5);
            }
        }

        // Mettre à jour l'IA du bot
        updateBot(delta);
    }

    renderer.render(scene, camera);
}