/**
 * OTIS Core • Digital Twin & Predictive Maintenance
 * Arquitetura de renderização Babylon.js e interface reativa
 */

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

// Constantes de Animação e Posição
const POS_BOTTOM = -1.6;
const POS_TOP = 2.2;
const DOOR_SLIDE = 0.82;
const COLOR_NOMINAL = new BABYLON.Color3(0.0, 0.85, 1.0);
const COLOR_ANOMALY = new BABYLON.Color3(1.0, 0.55, 0.0);

// Estado Global
let elevatorRoot = null;
let doorLeft = null;
let doorRight = null;
let ledMesh = null;
let cameraRef = null;

let baseDoorLeftX = -0.47;
let baseDoorRightX = 0.47;
let isMoving = false;
let currentFloor = "bottom";
let isAnomalyActive = false;

// Referências Mecânicas (Subconjunto 3D Roldana)
let detailedBearingRig = null;
let bearingOuterRing = null;
let bearingInnerRing = null;
let bearingCageRig = null;
let bearingFaultSpot = null;
let bearingBallsGroup = [];

// Elementos da Interface (HUD / DOM)
const hudTop = document.getElementById("hud-top");
const btnUp = document.getElementById("btn-up");
const btnDown = document.getElementById("btn-down");
const btnAnomaly = document.getElementById("btn-anomaly");
const statusLabel = document.getElementById("status-label");
const telemetryLabel = document.getElementById("telemetry-label");
const sensorDot = document.getElementById("sensor-dot");
const telemetryBox = document.getElementById("telemetry-box");
const bottomBar = document.getElementById("bottom-bar");
const diagnosticPanel = document.getElementById("diagnostic-panel");
const bearingBadge = document.getElementById("bearing-overlay-badge");
const schedulePanel = document.getElementById("schedule-panel");
const trafficChart = document.getElementById("trafficChart");
const btnConfirmOrder = document.getElementById("btn-confirm-order");

// --- UTILITÁRIOS ---

function setStatus(text) {
    if (statusLabel) statusLabel.innerText = text;
}

function updateUI() {
    if (btnUp) btnUp.disabled = isMoving || currentFloor === "top";
    if (btnDown) btnDown.disabled = isMoving || currentFloor === "bottom";
    if (btnAnomaly) btnAnomaly.disabled = isMoving;
}

function animateValue(start, end, duration, onUpdate) {
    return new Promise((resolve) => {
        const startTime = performance.now();
        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            const currentVal = start + (end - start) * progress;
            onUpdate(currentVal, progress);

            if (progress < 1.0) {
                requestAnimationFrame(step);
            } else {
                resolve();
            }
        }
        requestAnimationFrame(step);
    });
}

// --- MONTAGEM MECÂNICA 3D ---

function createDetailedBearingRig(scene) {
    detailedBearingRig = new BABYLON.TransformNode("Detailed_Bearing_Rig", scene);
    detailedBearingRig.position = new BABYLON.Vector3(-1.8, 0.6, 2.5);
    detailedBearingRig.scaling = new BABYLON.Vector3(1.9, 1.9, 1.9);

    const matPolishedChrome = new BABYLON.StandardMaterial("MatChrome", scene);
    matPolishedChrome.diffuseColor = new BABYLON.Color3(0.84, 0.87, 0.92);
    matPolishedChrome.specularColor = new BABYLON.Color3(1.0, 1.0, 1.0);
    matPolishedChrome.specularPower = 90;

    const matCageBrassSteel = new BABYLON.StandardMaterial("MatCage", scene);
    matCageBrassSteel.diffuseColor = new BABYLON.Color3(0.70, 0.72, 0.75);
    matCageBrassSteel.specularColor = new BABYLON.Color3(0.65, 0.65, 0.65);
    matCageBrassSteel.specularPower = 40;

    const matFault = new BABYLON.StandardMaterial("FaultMat", scene);
    matFault.diffuseColor = new BABYLON.Color3(1.0, 0.35, 0.0);
    matFault.emissiveColor = new BABYLON.Color3(1.0, 0.4, 0.0);

    const matSensorCase = new BABYLON.StandardMaterial("SensorCaseMat", scene);
    matSensorCase.diffuseColor = new BABYLON.Color3(0.12, 0.14, 0.18);
    matSensorCase.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    // 1. Capa / Anel Externo
    const outerProfile = [
        new BABYLON.Vector3(0.80, 0.13, 0),
        new BABYLON.Vector3(0.80, -0.13, 0),
        new BABYLON.Vector3(0.676, -0.13, 0),
        new BABYLON.Vector3(0.676, -0.07, 0),
        new BABYLON.Vector3(0.676 - (0.116 - Math.sqrt(Math.max(0, 0.116 ** 2 - 0.04 ** 2))), -0.04, 0),
        new BABYLON.Vector3(0.676 - 0.116, 0.0, 0),
        new BABYLON.Vector3(0.676 - (0.116 - Math.sqrt(Math.max(0, 0.116 ** 2 - 0.04 ** 2))), 0.04, 0),
        new BABYLON.Vector3(0.676, 0.07, 0),
        new BABYLON.Vector3(0.676, 0.13, 0)
    ];

    bearingOuterRing = BABYLON.MeshBuilder.CreateLathe("OuterRace", {
        shape: outerProfile,
        tessellation: 72,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, scene);
    bearingOuterRing.rotation.x = Math.PI / 2;
    bearingOuterRing.material = matPolishedChrome;
    bearingOuterRing.parent = detailedBearingRig;

    // 2. Anel Interno Fixo
    const innerProfile = [
        new BABYLON.Vector3(0.32, 0.13, 0),
        new BABYLON.Vector3(0.32, -0.13, 0),
        new BABYLON.Vector3(0.444, -0.13, 0),
        new BABYLON.Vector3(0.444, -0.07, 0),
        new BABYLON.Vector3(0.444 + (0.116 - Math.sqrt(Math.max(0, 0.116 ** 2 - 0.04 ** 2))), -0.04, 0),
        new BABYLON.Vector3(0.444 + 0.116, 0.0, 0),
        new BABYLON.Vector3(0.444 + (0.116 - Math.sqrt(Math.max(0, 0.116 ** 2 - 0.04 ** 2))), 0.04, 0),
        new BABYLON.Vector3(0.444, 0.07, 0),
        new BABYLON.Vector3(0.444, 0.13, 0)
    ];

    bearingInnerRing = BABYLON.MeshBuilder.CreateLathe("InnerRace", {
        shape: innerProfile,
        tessellation: 72,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, scene);
    bearingInnerRing.rotation.x = Math.PI / 2;
    bearingInnerRing.material = matPolishedChrome;
    bearingInnerRing.parent = detailedBearingRig;

    // 3. Gaiola e Conjunto de Esferas
    bearingCageRig = new BABYLON.TransformNode("BearingCageRig", scene);
    bearingCageRig.parent = detailedBearingRig;

    const ballRadius = 0.11;
    const orbitRadius = 0.56;
    const ballCount = 8;
    bearingBallsGroup = [];

    for (let i = 0; i < ballCount; i++) {
        const angle = (i / ballCount) * Math.PI * 2;

        const ball = BABYLON.MeshBuilder.CreateSphere(`Ball_${i}`, {
            diameter: ballRadius * 2,
            segments: 28
        }, scene);
        ball.position = new BABYLON.Vector3(Math.cos(angle) * orbitRadius, Math.sin(angle) * orbitRadius, 0);
        ball.material = matPolishedChrome;
        ball.parent = detailedBearingRig;
        bearingBallsGroup.push({ mesh: ball, baseAngle: angle });

        const rivetAngle = angle + (Math.PI / ballCount);
        const rivet = BABYLON.MeshBuilder.CreateCylinder(`CageRivet_${i}`, {
            diameter: 0.026,
            height: 0.18,
            tessellation: 16
        }, scene);
        rivet.position = new BABYLON.Vector3(Math.cos(rivetAngle) * orbitRadius, Math.sin(rivetAngle) * orbitRadius, 0);
        rivet.rotation.x = Math.PI / 2;
        rivet.material = matCageBrassSteel;
        rivet.parent = bearingCageRig;
    }

    // 4. Falha / Pitting Estático
    bearingFaultSpot = BABYLON.MeshBuilder.CreateSphere("FaultSpot", {
        diameterX: 0.07,
        diameterY: 0.04,
        diameterZ: 0.03,
        segments: 12
    }, scene);
    bearingFaultSpot.position = new BABYLON.Vector3(0.455, 0.02, 0.0);
    bearingFaultSpot.material = matFault;
    bearingFaultSpot.parent = detailedBearingRig;

    // 5. Sensor IoT Otis ONE
    const sensorBox = BABYLON.MeshBuilder.CreateBox("SensorBoxDetailed", { width: 0.42, height: 0.50, depth: 0.32 }, scene);
    sensorBox.position = new BABYLON.Vector3(0.98, 0.48, 0);
    sensorBox.material = matSensorCase;
    sensorBox.parent = detailedBearingRig;

    const sensorProbe = BABYLON.MeshBuilder.CreateCylinder("SensorProbe", { diameter: 0.11, height: 0.28, tessellation: 24 }, scene);
    sensorProbe.rotation.z = Math.PI / 3.5;
    sensorProbe.position = new BABYLON.Vector3(0.77, 0.28, 0);
    sensorProbe.material = matPolishedChrome;
    sensorProbe.parent = detailedBearingRig;

    const sensorLed = BABYLON.MeshBuilder.CreateSphere("SensorLedDetailed", { diameter: 0.08 }, scene);
    sensorLed.position = new BABYLON.Vector3(0.98, 0.68, 0.16);
    sensorLed.material = matFault;
    sensorLed.parent = detailedBearingRig;

    detailedBearingRig.setEnabled(false);
}

// --- ANIMAÇÃO DE PORTAS E CABINE ---

async function setDoorsEngasgo(open) {
    setStatus(open ? "Operador: Abertura Sob Sobrecarga..." : "Operador: Fechando...");
    const targetOffset = open ? DOOR_SLIDE : 0;
    const startOffset = open ? 0 : DOOR_SLIDE;

    await animateValue(startOffset, targetOffset, 2200, (offset, progress) => {
        let jitter = 0;
        if (progress > 0.08 && progress < 0.92) {
            jitter = Math.sin(progress * 65) * 0.01;
        }
        if (doorLeft) doorLeft.position.x = baseDoorLeftX - offset + jitter;
        if (doorRight) doorRight.position.x = baseDoorRightX + offset;
    });
}

async function setDoors(open) {
    setStatus(open ? "Abrindo Portas..." : "Fechando Portas...");
    const targetOffset = open ? DOOR_SLIDE : 0;
    const startOffset = open ? 0 : DOOR_SLIDE;

    await animateValue(startOffset, targetOffset, 900, (offset) => {
        if (doorLeft) doorLeft.position.x = baseDoorLeftX - offset;
        if (doorRight) doorRight.position.x = baseDoorRightX + offset;
    });
}

async function moveElevator(fromZ, toZ, durationMs) {
    await animateValue(fromZ, toZ, durationMs, (zVal) => {
        if (!elevatorRoot) return;
        if (Math.abs(elevatorRoot.position.y) > 0.001 || elevatorRoot.position.z === 0) {
            elevatorRoot.position.y = zVal;
        } else {
            elevatorRoot.position.z = zVal;
        }
    });
}

// --- CENA PRINCIPAL BABYLON.JS ---

const createScene = function () {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.09, 1.0);

    cameraRef = new BABYLON.ArcRotateCamera("Cam", Math.PI / 2, Math.PI / 2.2, 12.5, new BABYLON.Vector3(0, 0.6, 0), scene);
    cameraRef.attachControl(canvas, true);
    cameraRef.wheelPrecision = 28;
    cameraRef.lowerRadiusLimit = 3.5;
    cameraRef.upperRadiusLimit = 18.0;

    const hemi = new BABYLON.HemisphericLight("Hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.85;

    const dir = new BABYLON.DirectionalLight("Dir", new BABYLON.Vector3(-1, -2, -1), scene);
    dir.position = new BABYLON.Vector3(5, 8, 5);
    dir.intensity = 1.5;

    const bearingLight = new BABYLON.PointLight("BearingLight", new BABYLON.Vector3(-1.6, 1.2, 4.0), scene);
    bearingLight.intensity = 1.2;

    createDetailedBearingRig(scene);

    BABYLON.SceneLoader.Append("", "elevador.glb", scene, async function (loadedScene) {
        loadedScene.animationGroups.forEach(g => g.stop());

        elevatorRoot = loadedScene.transformNodes.find(n => n.name.includes("Elevator_Assembly")) ||
                       loadedScene.meshes.find(m => m.name.includes("Elevator_Assembly"));

        doorLeft = loadedScene.meshes.find(m => m.name.includes("Door_Left"));
        doorRight = loadedScene.meshes.find(m => m.name.includes("Door_Right"));

        if (!elevatorRoot && doorLeft && doorLeft.parent) {
            elevatorRoot = doorLeft.parent;
        }

        if (doorLeft) baseDoorLeftX = doorLeft.position.x;
        if (doorRight) baseDoorRightX = doorRight.position.x;

        ledMesh = loadedScene.meshes.find(m => m.name.includes("TelemetryLed") || m.material?.name.includes("TelemetryLed"));
        if (ledMesh && ledMesh.material) {
            ledMesh.material = ledMesh.material.clone("DynamicLedMat");
            ledMesh.material.emissiveColor = COLOR_NOMINAL.clone();
        }

        if (elevatorRoot) {
            if (elevatorRoot.position.y !== 0) elevatorRoot.position.y = POS_BOTTOM;
            else elevatorRoot.position.z = POS_BOTTOM;
        }

        currentFloor = "bottom";
        await setDoors(true);
        setStatus("Térreo (Aberto)");
        isMoving = false;
        updateUI();

        let pulseAngle = 0;
        let bearingRotationAngle = 0;

        scene.registerBeforeRender(() => {
            pulseAngle += 0.08;
            const intensity = 0.6 + 0.4 * Math.sin(pulseAngle);
            const baseColor = isAnomalyActive ? COLOR_ANOMALY : COLOR_NOMINAL;

            if (ledMesh && ledMesh.material) {
                ledMesh.material.emissiveColor = baseColor.scale(intensity);
            }

            if (detailedBearingRig && detailedBearingRig.isEnabled()) {
                bearingRotationAngle += 0.035;

                if (bearingOuterRing) {
                    bearingOuterRing.rotate(BABYLON.Axis.Y, 0.035, BABYLON.Space.LOCAL);
                }

                const cageSpeed = bearingRotationAngle * 0.60;
                if (bearingCageRig) {
                    bearingCageRig.rotation.z = cageSpeed;
                }

                const orbitRadius = 0.56;
                bearingBallsGroup.forEach(item => {
                    const curAngle = item.baseAngle + cageSpeed;
                    item.mesh.position.x = Math.cos(curAngle) * orbitRadius;
                    item.mesh.position.y = Math.sin(curAngle) * orbitRadius;
                    item.mesh.rotation.z = bearingRotationAngle * 1.5;
                });

                if (bearingFaultSpot && bearingFaultSpot.material) {
                    bearingFaultSpot.material.emissiveColor = COLOR_ANOMALY.scale(0.7 + 0.5 * Math.sin(pulseAngle * 2.0));
                }
            }
        });
    }, null, (scene, message, exception) => {
        console.warn("elevador.glb não carregado:", message, exception);
        setStatus("Modelo 3D ausente");
    });

    return scene;
};

const scene = createScene();
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

// --- OSCILOSCÓPIO SENSOR IOT (CANVAS 2D) ---

const waveCanvas = document.getElementById("waveCanvas");
const waveCtx = waveCanvas.getContext("2d");
let waveAnimId = null;
let waveOffset = 0;

function resizeWave() {
    if (!waveCanvas || !waveCanvas.parentElement) return;
    waveCanvas.width = waveCanvas.parentElement.clientWidth;
    waveCanvas.height = waveCanvas.parentElement.clientHeight;
}
window.addEventListener("resize", resizeWave);
resizeWave();

function drawWave() {
    waveOffset += 0.08;
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);

    waveCtx.strokeStyle = "rgba(255, 153, 0, 0.85)";
    waveCtx.lineWidth = 1.8;
    waveCtx.beginPath();

    const midY = waveCanvas.height / 2;
    for (let x = 0; x < waveCanvas.width; x++) {
        const fundamental = Math.sin(x * 0.04 + waveOffset) * 16;
        const harmonic = Math.sin(x * 0.22 - waveOffset * 2) * 6;
        const noise = (Math.random() - 0.5) * 4;
        const y = midY + fundamental + harmonic + noise;

        if (x === 0) waveCtx.moveTo(x, y);
        else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
    waveAnimId = requestAnimationFrame(drawWave);
}

function startWaveformAnimation() {
    resizeWave();
    if (!waveAnimId) drawWave();
}

function stopWaveformAnimation() {
    if (waveAnimId) {
        cancelAnimationFrame(waveAnimId);
        waveAnimId = null;
    }
}

// --- GRÁFICO DE TRÁFEGO ---

const trafficData = [
    { hour: "00", load: 8 },  { hour: "02", load: 3 },  { hour: "04", load: 4 },
    { hour: "06", load: 22 }, { hour: "08", load: 95 }, { hour: "10", load: 60 },
    { hour: "12", load: 78 }, { hour: "14", load: 65 }, { hour: "16", load: 72 },
    { hour: "18", load: 98 }, { hour: "20", load: 45 }, { hour: "22", load: 18 }
];

function renderTrafficChart() {
    if (!trafficChart) return;
    trafficChart.innerHTML = "";
    trafficData.forEach(item => {
        const group = document.createElement("div");
        group.className = "chart-bar-group";

        const isIdeal = (item.hour === "02" || item.hour === "04");
        const isPeak = item.load > 80;
        let barColor = "#0284c7";
        if (isPeak) barColor = "#ef4444";
        if (isIdeal) barColor = "#10b981";

        group.innerHTML = `
            <div class="chart-bar" style="height: ${item.load}%; background: ${barColor};" title="${item.hour}h: ${item.load}% fluxo"></div>
            <div class="chart-label">${item.hour}h</div>
        `;
        trafficChart.appendChild(group);
    });
}

// --- CONTROLE DE FLUXO DAS TELAS ---

async function entrarTela2() {
    if (isMoving) return;
    isMoving = true;
    isAnomalyActive = true;

    sensorDot.className = "dot anomaly";
    telemetryBox.className = "telemetry-indicator anomaly";
    telemetryLabel.innerText = "Alerta: Falha de Rolamento";

    bottomBar.style.transform = "translateX(-50%) translateY(100px)";
    bottomBar.style.opacity = "0";

    if (detailedBearingRig) detailedBearingRig.setEnabled(true);
    bearingBadge.classList.add("active");
    diagnosticPanel.classList.add("active");
    startWaveformAnimation();

    await setDoorsEngasgo(false);
    await new Promise(r => setTimeout(r, 150));
    await setDoorsEngasgo(true);

    isMoving = false;
}

async function voltarTela1() {
    if (isMoving) return;
    isMoving = true;

    diagnosticPanel.classList.remove("active");
    bearingBadge.classList.remove("active");
    stopWaveformAnimation();

    if (detailedBearingRig) detailedBearingRig.setEnabled(false);

    bottomBar.style.transform = "translateX(-50%) translateY(0)";
    bottomBar.style.opacity = "1";

    isMoving = false;
    updateUI();
}

async function executarCicloEngasgo() {
    if (isMoving) return;
    isMoving = true;
    await setDoorsEngasgo(false);
    await new Promise(r => setTimeout(r, 200));
    await setDoorsEngasgo(true);
    isMoving = false;
}

async function subir() {
    if (isMoving || currentFloor !== "bottom") return;
    isMoving = true;
    updateUI();

    await setDoors(false);
    setStatus("Subindo...");
    await moveElevator(POS_BOTTOM, POS_TOP, 2800);
    await setDoors(true);

    currentFloor = "top";
    setStatus("Topo (Aberto)");
    isMoving = false;
    updateUI();
}

async function descer() {
    if (isMoving || currentFloor !== "top") return;
    isMoving = true;
    updateUI();

    await setDoors(false);
    setStatus("Descendo...");
    await moveElevator(POS_TOP, POS_BOTTOM, 2800);
    await setDoors(true);

    currentFloor = "bottom";
    setStatus("Térreo (Aberto)");
    isMoving = false;
    updateUI();
}

function entrarTela3() {
    if (hudTop) hudTop.style.opacity = "0";
    renderTrafficChart();
    schedulePanel.classList.add("active");
}

function voltarParaDiagnostico() {
    schedulePanel.classList.remove("active");
    if (hudTop) hudTop.style.opacity = "1";
}

function confirmarAgendamento() {
    if (!btnConfirmOrder) return;
    btnConfirmOrder.innerText = "OS #4492 Agendada com Sucesso!";
    btnConfirmOrder.classList.replace("btn-success", "btn-secondary");
    btnConfirmOrder.disabled = true;

    setTimeout(() => {
        voltarParaDiagnostico();
        voltarTela1();
        btnConfirmOrder.innerText = "Confirmar Ordem de Serviço ✓";
        btnConfirmOrder.classList.replace("btn-secondary", "btn-success");
        btnConfirmOrder.disabled = false;
    }, 1800);
}

// --- EVENT LISTENERS ---
// Substituindo atributos onclick inline por event listeners padronizados

btnUp?.addEventListener("click", subir);
btnDown?.addEventListener("click", descer);
btnAnomaly?.addEventListener("click", entrarTela2);
document.getElementById("btn-close-inspection")?.addEventListener("click", voltarTela1);
document.getElementById("btn-replay-fault")?.addEventListener("click", executarCicloEngasgo);
document.getElementById("btn-back-overview")?.addEventListener("click", voltarTela1);
document.getElementById("btn-go-schedule")?.addEventListener("click", entrarTela3);
document.getElementById("btn-confirm-order")?.addEventListener("click", confirmarAgendamento);
document.getElementById("btn-back-diag")?.addEventListener("click", voltarParaDiagnostico);