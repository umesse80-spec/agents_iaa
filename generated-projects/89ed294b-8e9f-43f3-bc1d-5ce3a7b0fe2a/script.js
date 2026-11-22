let scene, camera, renderer;
let clock = new THREE.Clock();

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let isLocked = false;

const PLAYER_MAX_HP = 100;
const BOT_MAX_HP = 100;
let playerHp = PLAYER_MAX_HP;
let botHp = BOT_MAX_HP;

let ammo = 30;
const maxAmmo = 30;
let isReloading = false;
let canShoot = true;

const colliders = [];
let botMesh, playerGunGroup;

let euler = new THREE.Euler(0, 0, 0, 'YXZ');
const PI_2 = Math.PI / 2;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.FogExp2(0x1a1a1a, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.8, 15);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 40, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    createArena();
    createPlayerGun();
    createBot();
    setupEvents();

    window.addEventListener('resize', onWindowResize);
}

function createArena() {
    const arenaSize = 50;
    
    const floorGeo = new THREE.PlaneGeometry(arenaSize, arenaSize);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ceilingGeo = new THREE.PlaneGeometry(arenaSize, arenaSize);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.position.y = 10;
    ceiling.rotation.x = Math.PI / 2;
    scene.add(ceiling);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 });
    
    const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(arenaSize, 10, 1), wallMat);
    wallNorth.position.set(0, 5, -arenaSize / 2);
    scene.add(wallNorth);
    colliders.push(wallNorth);

    const wallSouth = new THREE.Mesh(new THREE.BoxGeometry(arenaSize, 10, 1), wallMat);
    wallSouth.position.set(0, 5, arenaSize / 2);
    scene.add(wallSouth);
    colliders.push(wallSouth);

    const wallEast = new THREE.Mesh(new THREE.BoxGeometry(1, 10, arenaSize), wallMat);
    wallEast.position.set(arenaSize / 2, 5, 0);
    scene.add(wallEast);
    colliders.push(wallEast);

    const wallWest = new THREE.Mesh(new THREE.BoxGeometry(1, 10, arenaSize), wallMat);
    wallWest.position.set(-arenaSize / 2, 5, 0);
    scene.add(wallWest);
    colliders.push(wallWest);

    const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.4 });
    const positions = [
        { x: -10, z: -10, w: 6, h: 5, d: 2 },
        { x: 10, z: 10, w: 6, h: 5, d: 2 },
        { x: -12, z: 10, w: 2, h: 5, d: 6 },
        { x: 12, z: -10, w: 2, h: 5, d: 6 },
        { x: 0, z: 0, w: 4, h: 5, d: 4 }
    ];

    positions.forEach(pos => {
        const obsGeo = new THREE.BoxGeometry(pos.w, pos.h, pos.d);
        const obs = new THREE.Mesh(obsGeo, obstacleMat);
        obs.position.set(pos.x, pos.h / 2, pos.z);
        obs.castShadow = true;
        obs.receiveShadow = true;
        scene.add(obs);
        colliders.push(obs);
    });
}

function createPlayerGun() {
    playerGunGroup = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.8), bodyMat);
    playerGunGroup.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.6);
    playerGunGroup.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.2), bodyMat);
    mag.position.set(0, -0.25, -0.1);
    mag.rotation.x = -Math.PI / 6;
    playerGunGroup.add(mag);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.3), woodMat);
    stock.position.set(0, -0.15, 0.4);
    stock.rotation.x = Math.PI / 6;
    playerGunGroup.add(stock);

    playerGunGroup.position.set(0.3, -0.25, -0.5);
    camera.add(playerGunGroup);
    scene.add(camera);
}

function createBot() {
    const botGroup = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0048ba });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.5), bodyMat);
    torso.position.y = 0.6;
    torso.castShadow = true;
    botGroup.add(torso);

    const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), headMat);
    head.position.y = 1.4;
    head.castShadow = true;
    botGroup.add(head);

    const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.8), gunMat);
    botGun.position.set(0.5, 0.6, -0.5);
    botGroup.add(botGun);

    botMesh = botGroup;
    botMesh.position.set(0, 0, -15);
    scene.add(botMesh);
}

function setupEvents() {
    const blocker = document.getElementById('blocker');

    blocker.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        isLocked = document.pointerLockElement === document.body;
        blocker.style.display = isLocked ? 'none' : 'flex';
    });

    document.addEventListener('mousemove', (event) => {
        if (!isLocked) return;

        const movementX = event.movementX || event.mozMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || 0;

        euler.setFromQuaternion(camera.quaternion);
        euler.y -= movementX * 0.002;
        euler.x -= movementY * 0.002;
        euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
        camera.quaternion.setFromEuler(euler);
    });

    document.addEventListener('keydown', (e) => handleKeyEvent(e, true));
    document.addEventListener('keyup', (e) => handleKeyEvent(e, false));
    window.addEventListener('mousedown', (e) => {
        if (isLocked && e.button === 0) shoot();
    });
}

function handleKeyEvent(e, isDown) {
    switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = isDown;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = isDown;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = isDown;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = isDown;
            break;
        case 'KeyR':
            if (isDown) reload();
            break;
    }
}

function shoot() {
    if (!canShoot || isReloading) return;

    if (ammo <= 0) {
        reload();
        return;
    }

    ammo--;
    updateAmmoDisplay();

    playerGunGroup.position.z += 0.1;
    setTimeout(() => { playerGunGroup.position.z -= 0.1; }, 80);

    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(center, camera);

    const intersects = raycaster.intersectObject(botMesh, true);
    if (intersects.length > 0) {
        damageBot(25);
    }
}

function reload() {
    if (isReloading || ammo === maxAmmo) return;
    isReloading = true;
    document.getElementById('reload-msg').style.display = 'block';

    setTimeout(() => {
        ammo = maxAmmo;
        isReloading = false;
        document.getElementById('reload-msg').style.display = 'none';
        updateAmmoDisplay();
    }, 1500);
}

function updateAmmoDisplay() {
    document.getElementById('ammo-count').innerText = ammo;
}

function damageBot(amount) {
    botHp -= amount;
    if (botHp < 0) botHp = 0;
    document.getElementById('bot-hp').style.width = botHp + '%';

    if (botHp === 0) {
        endGame(true);
    }
}

function damagePlayer(amount) {
    playerHp -= amount;
    if (playerHp < 0) playerHp = 0;
    document.getElementById('player-hp').style.width = playerHp + '%';

    if (playerHp === 0) {
        endGame(false);
    }
}

function endGame(playerWon) {
    isLocked = false;
    document.exitPointerLock();

    const screen = document.getElementById('game-over-screen');
    const title = document.getElementById('game-over-title');

    if (playerWon) {
        title.innerText = "VICTOIRE !";
        title.style.color = "#2ed573";
    } else {
        title.innerText = "DÉFAITE...";
        title.style.color = "#ff4757";
    }

    screen.style.display = 'flex';
    screen.onclick = () => location.reload();
}

let botShootTimer = 0;

function updateBot(delta) {
    if (botHp <= 0) return;

    const botPosition = botMesh.position;
    const playerPosition = camera.position;

    const directionToPlayer = new THREE.Vector3().subVectors(playerPosition, botPosition);
    directionToPlayer.y = 0;
    const distanceToPlayer = directionToPlayer.length();

    directionToPlayer.normalize();

    const speed = 3.5 * delta;
    if (distanceToPlayer > 6) {
        botMesh.position.addScaledVector(directionToPlayer, speed);
    } else if (distanceToPlayer < 4) {
        botMesh.position.addScaledVector(directionToPlayer, -speed);
    }

    botMesh.lookAt(playerPosition.x, botMesh.position.y, playerPosition.z);

    botShootTimer += delta;
    if (botShootTimer > 1.2 && distanceToPlayer < 25) {
        botShootTimer = 0;
        if (Math.random() > 0.3) {
            damagePlayer(10);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 40.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 40.0 * delta;

        camera.translateX(velocity.x * delta);
        camera.translateZ(velocity.z * delta);

        camera.position.x = Math.max(-23, Math.min(23, camera.position.x));
        camera.position.z = Math.max(-23, Math.min(23, camera.position.z));
        camera.position.y = 1.8;

        updateBot(delta);
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}