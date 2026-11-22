// --- VARIABLES GLOBALES DU JEU ---
let camera, scene, renderer, controls;
let clock = new THREE.Clock();

// Déplacements
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

// Éléments de jeu & Collisions
const colliders = [];
const targets = [];
let score = 0;
let ammo = 30;

// Raycaster pour les tirs
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0); // Centre de l'écran

// Initialisation
init();
animate();

function init() {
    // 1. Scène et Caméra
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.8, 10);

    // 2. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 3. Contrôles PointerLock
    controls = new THREE.PointerLockControls(camera, document.body);

    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');

    instructions.addEventListener('click', () => {
        controls.lock();
    });

    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
    });

    controls.addEventListener('unlock', () => {
        blocker.style.display = 'flex';
    });

    scene.add(controls.getObject());

    // 4. Éclairage
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00ffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // 5. Environnement (Sol, Murs, Obstacles)
    createEnvironment();

    // 6. Cibles Ennemies
    createTargets();

    // 7. Écouteurs d'événements Clavier & Souris
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
}

// --- CRÉATION DE L'ENVIRONNEMENT ---
function createEnvironment() {
    // Sol texturé procéduralement via Canvas 2D
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111122';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#222244';
    ctx.lineWidth = 4;
    for (let i = 0; i < 512; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, 512);
        ctx.moveTo(0, i); ctx.lineTo(512, i);
        ctx.stroke();
    }

    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(20, 20);

    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Murs d'enceinte (Arena)
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5 });
    
    createWall(0, 5, -100, 200, 10, 2, wallMaterial); // Nord
    createWall(0, 5, 100, 200, 10, 2, wallMaterial);  // Sud
    createWall(-100, 5, 0, 2, 10, 200, wallMaterial); // Ouest
    createWall(100, 5, 0, 2, 10, 200, wallMaterial);  // Est

    // Obstacles intérieurs (piliers et boîtes)
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f3460, roughness: 0.3, metalness: 0.5 });
    for (let i = 0; i < 15; i++) {
        const w = Math.random() * 6 + 2;
        const h = Math.random() * 8 + 2;
        const d = Math.random() * 6 + 2;
        const x = (Math.random() - 0.5) * 160;
        const z = (Math.random() - 0.5) * 160;

        const boxGeo = new THREE.BoxGeometry(w, h, d);
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(x, h / 2, z);
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
        colliders.push(box);
    }
}

function createWall(x, y, z, w, h, d, material) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const wall = new THREE.Mesh(geo, material);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    colliders.push(wall);
}

// --- CRÉATION DES CIBLES ---
function createTargets() {
    const targetGeo = new THREE.SphereGeometry(1.5, 32, 32);
    const targetMat = new THREE.MeshStandardMaterial({ 
        color: 0xff0055, 
        emissive: 0xff0055, 
        emissiveIntensity: 0.5,
        roughness: 0.2 
    });

    for (let i = 0; i < 10; i++) {
        const target = new THREE.Mesh(targetGeo, targetMat.clone());
        resetTargetPosition(target);
        scene.add(target);
        targets.push(target);
    }
}

function resetTargetPosition(target) {
    target.position.x = (Math.random() - 0.5) * 140;
    target.position.y = Math.random() * 6 + 1.5;
    target.position.z = (Math.random() - 0.5) * 140;
}

// --- GESTION DES ENTRÉES CLAVIER ---
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
        case 'KeyZ': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA':
        case 'KeyQ': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
        case 'KeyZ': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA':
        case 'KeyQ': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

// --- MÉCANIQUE DE TIR ---
function onMouseDown(event) {
    if (controls.isLocked && event.button === 0) {
        if (ammo > 0) {
            ammo--;
            document.getElementById('ammo').innerText = ammo;

            // Effet visuel flash tir (lumière temporaire)
            const flash = new THREE.PointLight(0xffff00, 2, 5);
            camera.add(flash);
            flash.position.set(0.5, -0.5, -1);
            setTimeout(() => camera.remove(flash), 50);

            // Raycast pour détecter l'impact
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(targets);

            if (intersects.length > 0) {
                const hitTarget = intersects[0].object;
                score += 10;
                document.getElementById('score').innerText = score;

                // Feedback visuel impact (changement de couleur éphémère)
                hitTarget.material.emissive.setHex(0xffffff);
                setTimeout(() => hitTarget.material.emissive.setHex(0xff0055), 150);

                // Déplacer la cible touchée
                resetTargetPosition(hitTarget);
            }
        } else {
            // Recharge automatique simple
            ammo = 30;
            document.getElementById('ammo').innerText = ammo;
        }
    }
}

// --- REDIMENSIONNEMENT ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- BOUCLE DE JEU (ANIMATION / PHYSIQUE) ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (controls.isLocked) {
        // Gestion de la vitesse et des mouvements
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 40.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 40.0 * delta;

        // Sauvegarde de la position avant déplacement pour test de collision simple
        const oldPosition = controls.getObject().position.clone();

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Détection basique des collisions avec les boîtes/murs
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            controls.getObject().position,
            new THREE.Vector3(1, 2, 1)
        );

        for (let i = 0; i < colliders.length; i++) {
            const colliderBox = new THREE.Box3().setFromObject(colliders[i]);
            if (playerBox.intersectsBox(colliderBox)) {
                // Annuler le mouvement en cas de collision
                controls.getObject().position.copy(oldPosition);
                break;
            }
        }

        // Maintenir la hauteur fixe du joueur (vue FPS sol)
        controls.getObject().position.y = 1.8;
    }

    renderer.render(scene, camera);
}