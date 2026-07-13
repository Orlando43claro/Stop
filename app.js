import { db } from "./firebase-config.js";
import { 
    collection, doc, addDoc, getDocs, updateDoc, onSnapshot, query, where, arrayUnion, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let miNombre = "";
let idPartidaActiva = null;
let desescribirListener = null;

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

// --- 1. CONFIGURACIÓN DE NOMBRE ---
document.getElementById('btn-guardar-nombre').addEventListener('click', () => {
    const input = document.getElementById('username').value.trim();
    if(!input) return alert("Por favor ingresa tu apodo");
    miNombre = input;
    loginBox.classList.add('hidden');
    lobbyOptions.classList.remove('hidden');
    document.getElementById('user-badge').textContent = `Jugador: ${miNombre}`;
});

// --- 2. LOGICA DE EMPAREJAMIENTO PÚBLICO MEJORADA ---
document.getElementById('btn-buscar-publica').addEventListener('click', async () => {
    lobbyOptions.classList.add('hidden');
    matchmakingStatus.classList.remove('hidden');
    
    try {
        // Buscamos salas que estén esperando un rival
        const q = query(collection(db, "partidas"), where("tipo", "==", "publica"), where("estado", "==", "buscando"));
        const querySnapshot = await getDocs(q);
        
        let salaEncontrada = false;

        for (let docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            // Evitamos unirnos a nuestra propia sala si se quedó colgada
            if (data.jugadores && !data.jugadores.includes(miNombre)) {
                idPartidaActiva = docSnap.id;
                salaEncontrada = true;
                
                await updateDoc(doc(db, "partidas", idPartidaActiva), {
                    jugadores: arrayUnion(miNombre),
                    estado: "esperando" // Cambia el estado para que ambos entren al lobby
                });
                conectarAlJuego(idPartidaActiva);
                break;
            }
        }

        if (!salaEncontrada) {
            // Si no hay ninguna libre, creamos la nuestra
            const nuevaPartida = await addDoc(collection(db, "partidas"), {
                tipo: "publica",
                pin: "",
                estado: "buscando",
                jugadores: [miNombre],
                letra: "",
                quienPusoStop: "",
                respuestas: {}
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

    const nuevaPartidaPrivada = await addDoc(collection(db, "partidas"), {
        tipo: "privada",
        pin: pin,
        estado: "esperando",
        jugadores: [miNombre],
        letra: "",
        quienPusoStop: "",
        respuestas: {}
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

        if (datos.estado === "buscando") {
            matchmakingStatus.getAnimations;
            matchmakingStatus.classList.remove('hidden');
            lobbyWaiting.classList.add('hidden');
        } 
        else if (datos.estado === "esperando") {
            matchmakingStatus.classList.add('hidden');
            lobbyWaiting.classList.remove('hidden');
            
            document.getElementById('room-info-display').textContent = 
                datos.tipo === "privada" ? `🔒 Sala Privada PIN: ${datos.pin}` : "🌐 Partida Pública Configurada";
            
            const divPlayers = document.getElementById('players-list');
            divPlayers.innerHTML = datos.jugadores.map(p => `<p>• <b>${p}</b> ${p === miNombre ? '(Tú)' : ''}</p>`).join('');
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
            renderizarTabla(datos.respuestas, datos.letra);
        }
    });
}

// --- 6. INICIAR RONDA / MANDAR LETRA ---
document.getElementById('btn-iniciar-juego').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    const letras = "ABCDEFGHIJLMNOPRSTUV";
    const letraAleatoria = letras[Math.floor(Math.random() * letras.length)];
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estado: "jugando",
        letra: letraAleatoria,
        quienPusoStop: "",
        respuestas: {}
    });
});

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

// --- 8. MOTOR DE CÁLCULO DE PUNTOS AUTOMÁTICO ---
function calcularPuntos(respuestas, letraActiva) {
    const jugadores = Object.keys(respuestas);
    const puntajes = {};
    const categorias = ['nombre', 'apellido', 'ciudad', 'fruta', 'color'];

    // Inicializar puntajes en cero
    jugadores.forEach(j => puntajes[j] = 0);

    categorias.forEach(cat => {
        const registroPalabras = [];

        // Recolectar palabras válidas de la categoría
        jugadores.forEach(j => {
            const palabra = respuestas[j][cat] ? respuestas[j][cat].trim().toLowerCase() : '-';
            // Valida que empiece con la letra correcta y no sea un guion
            if (palabra !== '-' && palabra.startsWith(letraActiva.toLowerCase())) {
                registroPalabras.push({ jugador: j, palabra: palabra });
            }
        });

        // Evaluar repetición
        registroPalabras.forEach(item => {
            const repetida = registroPalabras.filter(p => p.palabra === item.palabra).length > 1;
            if (repetida) {
                puntajes[item.jugador] += 50; // Palabra repetida
            } else {
                puntajes[item.jugador] += 100; // Palabra única válida
            }
        });
    });

    return puntajes;
}

function renderizarTabla(respuestas, letraActiva) {
    const tbody = document.getElementById('results-body');
    tbody.innerHTML = "";
    
    // Calculamos los puntajes antes de pintar la tabla
    const tablaPuntos = calcularPuntos(respuestas, letraActiva);

    Object.keys(respuestas).forEach(jugador => {
        const r = respuestas[jugador];
        const tr = document.createElement('tr');
        
        // Si el jugador actual es el ganador del mayor puntaje, le añadimos un estilo especial
        tr.innerHTML = `
            <td><strong>${jugador}</strong></td>
            <td>${r.nombre}</td>
            <td>${r.apellido}</td>
            <td>${r.ciudad}</td>
            <td>${r.fruta}</td>
            <td>${r.color}</td>
            <td style="color: #22c55e; font-weight: bold;">${tablaPuntos[jugador] || 0} pts</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- 9. REINICIAR PARTIDA ACTUAL ---
document.getElementById('btn-volver-lobby').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    document.getElementById('stop-form').reset();
    await updateDoc(doc(db, "partidas", idPartidaActiva), { estado: "esperando" });
});
