import { db } from "./firebase-config.js";
import { 
    collection, doc, addDoc, getDocs, updateDoc, onSnapshot, query, where, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let miNombre = "";
let idPartidaActiva = null;
let desescribirListener = null;
let puntosGlobales = {}; // Guarda el historial de las rondas

// Elementos DOM
const loginBox = document.getElementById('login-box');
const lobbyOptions = document.getElementById('lobby-options');
const pinCreationBox = document.getElementById('pin-creation-box');
const pinJoinBox = document.getElementById('pin-join-box');
const matchmakingStatus = document.getElementById('matchmaking-status');
const lobbyWaiting = document.getElementById('lobby-waiting');

const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');
const screenResults = document.getElementById('screen-results');

const revanchaBox = document.getElementById('revancha-box');
const revanchaTexto = document.getElementById('revancha-texto');
const revanchaBotones = document.getElementById('revancha-botones');
const btnVolverLobby = document.getElementById('btn-volver-lobby');
const marcadorSuperior = document.getElementById('marcador-superior');

// --- 1. CONFIGURACIÓN DE NOMBRE ---
document.getElementById('btn-guardar-nombre').addEventListener('click', () => {
    const input = document.getElementById('username').value.trim();
    if(!input) return alert("Por favor ingresa tu apodo");
    miNombre = input;
    loginBox.classList.add('hidden');
    lobbyOptions.classList.remove('hidden');
    document.getElementById('user-badge').textContent = `Jugador: ${miNombre}`;
});

// --- 2. LOGICA DE EMPAREJAMIENTO PÚBLICO ---
document.getElementById('btn-buscar-publica').addEventListener('click', async () => {
    lobbyOptions.classList.add('hidden');
    matchmakingStatus.classList.remove('hidden');
    puntosGlobales = {}; 
    
    try {
        const q = query(collection(db, "partidas"), where("tipo", "==", "publica"), where("estado", "==", "buscando"));
        const querySnapshot = await getDocs(q);
        
        let salaEncontrada = false;

        for (let docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            if (data.jugadores && !data.jugadores.includes(miNombre)) {
                idPartidaActiva = docSnap.id;
                salaEncontrada = true;
                
                await updateDoc(doc(db, "partidas", idPartidaActiva), {
                    jugadores: arrayUnion(miNombre),
                    estado: "esperando"
                });
                conectarAlJuego(idPartidaActiva);
                break;
            }
        }

        if (!salaEncontrada) {
            const nuevaPartida = await addDoc(collection(db, "partidas"), {
                tipo: "publica",
                pin: "",
                estado: "buscando",
                jugadores: [miNombre],
                letra: "",
                quienPusoStop: "",
                respuestas: {},
                votosRevancha: {},
                estadoRevancha: ""
            });
            idPartidaActiva = nuevaPartida.id;
            conectarAlJuego(idPartidaActiva);
        }
    } catch (e) {
        console.error(e);
        alert("Error en la red de emparejamiento.");
    }
});

// --- 3. CREAR SALA PRIVADA CON PIN ---
document.getElementById('btn-abrir-crear-privada').addEventListener('click', () => {
    pinCreationBox.classList.toggle('hidden');
    pinJoinBox.classList.add('hidden');
});

document.getElementById('btn-confirmar-crear-privada').addEventListener('click', async () => {
    const pin = document.getElementById('create-pin').value;
    if (pin.length !== 4) return alert("El PIN debe tener exactamente 4 números");
    
    lobbyOptions.classList.add('hidden');
    pinCreationBox.classList.add('hidden');
    puntosGlobales = {};

    const nuevaPartidaPrivada = await addDoc(collection(db, "partidas"), {
        tipo: "privada",
        pin: pin,
        estado: "esperando",
        jugadores: [miNombre],
        letra: "",
        quienPusoStop: "",
        respuestas: {},
        votosRevancha: {},
        estadoRevancha: ""
    });
    idPartidaActiva = nuevaPartidaPrivada.id;
    conectarAlJuego(idPartidaActiva);
});

// --- 4. UNIRSE A SALA PRIVADA ---
document.getElementById('btn-abrir-unirse-privada').addEventListener('click', () => {
    pinJoinBox.classList.toggle('hidden');
    pinCreationBox.classList.add('hidden');
});

document.getElementById('btn-confirmar-unirse-privada').addEventListener('click', async () => {
    const pin = document.getElementById('join-pin').value;
    if (pin.length !== 4) return alert("Ingresa el código PIN de 4 números");
    puntosGlobales = {};

    const q = query(collection(db, "partidas"), where("tipo", "==", "privada"), where("pin", "==", pin), where("estado", "==", "esperando"));
    const querySnapshot = await getDocs(q);

    if(!querySnapshot.empty) {
        const partidaDoc = querySnapshot.docs[0];
        idPartidaActiva = partidaDoc.id;
        
        await updateDoc(doc(db, "partidas", idPartidaActiva), {
            jugadores: arrayUnion(miNombre)
        });
        pinJoinBox.classList.add('hidden');
        lobbyOptions.classList.add('hidden');
        conectarAlJuego(idPartidaActiva);
    } else {
        alert("La sala privada no existe o la ronda ya ha comenzado.");
    }
});

// --- CANCELAR EL BUSCADOR ONLINE ---
document.getElementById('btn-cancelar-busqueda').addEventListener('click', async () => {
    if(idPartidaActiva) {
        if(desescribirListener) desescribirListener();
        await updateDoc(doc(db, "partidas", idPartidaActiva), { estado: "cancelada" });
    }
    matchmakingStatus.classList.add('hidden');
    lobbyOptions.classList.remove('hidden');
    idPartidaActiva = null;
});

// --- 5. ESCUCHA ACTIVA EN TIEMPO REAL ---
function conectarAlJuego(idSala) {
    const salaRef = doc(db, "partidas", idSala);
    if(desescribirListener) desescribirListener();

    desescribirListener = onSnapshot(salaRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const datos = snapshot.data();

        // Actualizar nombres del marcador superior
        if(datos.jugadores) {
            datos.jugadores.forEach(j => { if(!puntosGlobales[j]) puntosGlobales[j] = 0; });
            actualizarMarcadorSuperior();
        }

        if (datos.estado === "buscando") {
            matchmakingStatus.classList.remove('hidden');
            lobbyWaiting.classList.add('hidden');
        } 
        else if (datos.estado === "esperando") {
            screenLobby.classList.remove('hidden');
            screenGame.classList.add('hidden');
            screenResults.classList.add('hidden');
            matchmakingStatus.classList.add('hidden');
            lobbyWaiting.classList.remove('hidden');
            
            document.getElementById('room-info-display').textContent = 
                datos.tipo === "privada" ? `🔒 Sala Privada PIN: ${datos.pin}` : "🌐 Partida Pública Configurada";
            
            const divPlayers = document.getElementById('players-list');
            divPlayers.innerHTML = datos.jugadores.map(p => `<p>• <b>${p}</b> ${p === miNombre ? '(Tú)' : ''}</p>`).join('');
            
            // Reajuste total de botones
            revanchaBox.classList.add('hidden');
            btnVolverLobby.classList.remove('hidden');
        } 
        else if (datos.estado === "jugando") {
            screenLobby.classList.add('hidden');
            screenGame.classList.remove('hidden');
            screenResults.classList.add('hidden');
            document.getElementById('active-letter').textContent = datos.letra;
        } 
        else if (datos.estado === "resultados") {
            screenLobby.classList.add('hidden');
            screenGame.classList.add('hidden');
            screenResults.classList.remove('hidden');
            
            enviarRespuestasTardias(datos.respuestas, salaRef);
            document.getElementById('stop-announcer').textContent = `¡Ronda finalizada por: ${datos.quienPusoStop}!`;
            
            // Renderiza la tabla y acumula puntos una única vez por ronda
            renderizarTabla(datos.respuestas, datos.letra);

            // MANEJO SEGURO DE REVANCHA BASADO EN TU ENTORNO
            const votos = datos.votosRevancha || {};
            const misRivales = datos.jugadores.filter(p => p !== miNombre);
            const miVoto = votos[miNombre];
            const votoRival = votos[misRivales[0]]; // Tomamos el primer rival directo

            if (datos.estadoRevancha === "procesando") {
                btnVolverLobby.classList.add('hidden');
                revanchaBox.classList.remove('hidden');

                if (miVoto === "si" && !votoRival) {
                    revanchaTexto.textContent = "Esperando respuesta de tu rival...";
                    revanchaBotones.classList.add('hidden');
                } 
                else if (!miVoto && votoRival === "si") {
                    revanchaTexto.textContent = `¡${misRivales[0]} pide revancha! ¿Aceptas?`;
                    revanchaBotones.classList.remove('hidden');
                }
            }
            
            if (datos.estadoRevancha === "rechazada") {
                if (miVoto === "si") {
                    alert("Tu rival dijo: No gracias o ahora no.");
                }
                irAlInicio();
            }
        }
    });
}

function actualizarMarcadorSuperior() {
    marcadorSuperior.innerHTML = Object.keys(puntosGlobales)
        .map(j => `<span>${j}: <b style="color:#22c55e;">${puntosGlobales[j]} Pts</b></span>`)
        .join(' <span style="color:#334155;">|</span> ');
}

function irAlInicio() {
    if(desescribirListener) desescribirListener();
    idPartidaActiva = null;
    puntosGlobales = {};
    marcadorSuperior.innerHTML = "";
    revanchaBox.classList.add('hidden');
    screenResults.classList.add('hidden');
    screenLobby.classList.remove('hidden');
    lobbyOptions.classList.remove('hidden');
    lobbyWaiting.classList.add('hidden');
}

// --- 6. INICIAR RONDA / MANDAR LETRA ---
document.getElementById('btn-iniciar-juego').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    iniciarSiguienteRonda();
});

async function iniciarSiguienteRonda() {
    const letras = "ABCDEFGHIJLMNOPRSTUV";
    const letraAleatoria = letras[Math.floor(Math.random() * letras.length)];
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estado: "jugando",
        letra: letraAleatoria,
        quienPusoStop: "",
        respuestas: {},
        votosRevancha: {},
        estadoRevancha: ""
    });
}

// --- 7. PRESIONAR ¡STOP! ---
document.getElementById('btn-stop').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    const misRespuestas = {
        nombre: document.getElementById('ans-nombre').value.trim().toLowerCase() || '-',
        apellido: document.getElementById('ans-apellido').value.trim().toLowerCase() || '-',
        ciudad: document.getElementById('ans-ciudad').value.trim().toLowerCase() || '-',
        fruta: document.getElementById('ans-fruta').value.trim().toLowerCase() || '-',
        color: document.getElementById('ans-color').value.trim().toLowerCase() || '-'
    };

    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estado: "resultados",
        quienPusoStop: miNombre,
        [`respuestas.${miNombre}`]: misRespuestas
    });
});

async function enviarRespuestasTardias(respuestasActuales, salaRef) {
    if (miNombre && !respuestasActuales[miNombre]) {
        const misRespuestas = {
            nombre: document.getElementById('ans-nombre').value.trim().toLowerCase() || '-',
            apellido: document.getElementById('ans-apellido').value.trim().toLowerCase() || '-',
            ciudad: document.getElementById('ans-ciudad').value.trim().toLowerCase() || '-',
            fruta: document.getElementById('ans-fruta').value.trim().toLowerCase() || '-',
            color: document.getElementById('ans-color').value.trim().toLowerCase() || '-'
        };
        await updateDoc(salaRef, { [`respuestas.${miNombre}`]: misRespuestas });
    }
}

// --- 8. MOTOR DE CÁLCULO DE PUNTOS ---
function calcularPuntosRonda(respuestas, letraActiva) {
    const jugadores = Object.keys(respuestas);
    const puntajes = {};
    const categorias = ['nombre', 'apellido', 'ciudad', 'fruta', 'color'];

    jugadores.forEach(j => puntajes[j] = 0);

    categorias.forEach(cat => {
        const registroPalabras = [];
        jugadores.forEach(j => {
            const palabra = respuestas[j][cat] ? respuestas[j][cat].trim().toLowerCase() : '-';
            if (palabra !== '-' && palabra.startsWith(letraActiva.toLowerCase())) {
                registroPalabras.push({ jugador: j, palabra: palabra });
            }
        });

        registroPalabras.forEach(item => {
            const repetida = registroPalabras.filter(p => p.palabra === item.palabra).length > 1;
            if (repetida) {
                puntajes[item.jugador] += 50;
            } else {
                puntajes[item.jugador] += 100;
            }
        });
    });

    return puntajes;
}

// Variable de control local para no sumar doble en la misma pantalla
let ultimaLetraProcesada = "";

function renderizarTabla(respuestas, letraActiva) {
    const tbody = document.getElementById('results-body');
    tbody.innerHTML = "";
    
    const tablaPuntosRonda = calcularPuntosRonda(respuestas, letraActiva);

    // Sumar al marcador global solo si cambió la ronda
    if (letraActiva !== ultimaLetraProcesada && Object.keys(respuestas).length >= 2) {
        Object.keys(tablaPuntosRonda).forEach(j => {
            puntosGlobales[j] = (puntosGlobales[j] || 0) + tablaPuntosRonda[j];
        });
        ultimaLetraProcesada = letraActiva;
        actualizarMarcadorSuperior();
    }

    Object.keys(respuestas).forEach(jugador => {
        const r = respuestas[jugador];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${jugador}</strong></td>
            <td>${r.nombre}</td>
            <td>${r.apellido}</td>
            <td>${r.ciudad}</td>
            <td>${r.fruta}</td>
            <td>${r.color}</td>
            <td style="color: #22c55e; font-weight: bold;">${tablaPuntosRonda[jugador] || 0} pts</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- 9. CONTROL DE VOTACIÓN DE REVANCHAS ---

// Al dar clic en "Nueva Ronda", el jugador vota que "SÍ"
document.getElementById('btn-volver-lobby').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estadoRevancha: "procesando",
        [`votosRevancha.${miNombre}`]: "si"
    });
});

// Si el rival acepta dándole al botón "Sí, ¡Dale!"
document.getElementById('btn-revancha-si').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    document.getElementById('stop-form').reset();
    
    // Al aceptar los dos, se reinicia el juego directamente
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estado: "esperando",
        estadoRevancha: "",
        votosRevancha: {},
        respuestas: {}
    });
});

// Si le da al botón "No, salir"
document.getElementById('btn-revancha-no').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estadoRevancha: "rechazada",
        [`votosRevancha.${miNombre}`]: "no"
    });
    irAlInicio();
});
