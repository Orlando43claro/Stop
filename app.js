import { db } from "./firebase-config.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, onSnapshot, query, where, arrayUnion, increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth();
let miNombre = "";
let idPartidaActiva = null;
let desescribirListener = null;
let ultimaLetraProcesada = "";

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
const btnStop = document.getElementById('btn-stop');

// --- 1. OBSERVADOR DE SESIÓN EN FIREBASE ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (userDoc.exists()) {
            miNombre = userDoc.data().nombre;
            document.getElementById('user-badge').textContent = `Jugador: ${miNombre}`;
            loginBox.classList.add('hidden');
            lobbyOptions.classList.remove('hidden');
            conectarMisPuntosPermanentes(user.uid);
        }
    } else {
        miNombre = "";
        document.getElementById('user-badge').textContent = "Inicia sesión";
        marcadorSuperior.innerHTML = "";
        loginBox.classList.remove('hidden');
        lobbyOptions.classList.add('hidden');
    }
});

document.getElementById('btn-ingresar-auth').addEventListener('click', async () => {
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;
    const apodoInput = document.getElementById('username').value.trim();

    if(!email || !password) return alert("Ingresa tu correo y contraseña");

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            if(!apodoInput) return alert("Tu cuenta no existe. Introduce un Apodo para registrarte.");
            
            try {
                const credenciales = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "usuarios", credenciales.user.uid), {
                    nombre: apodoInput,
                    puntosTotales: 0,
                    email: email
                });
            } catch (err) {
                alert("Error al registrar cuenta: " + err.message);
            }
        } else {
            alert("Error de ingreso: " + error.message);
        }
    }
});

document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
    signOut(auth);
});

function conectarMisPuntosPermanentes(uid) {
    onSnapshot(doc(db, "usuarios", uid), (docSnap) => {
        if(docSnap.exists()) {
            const datos = docSnap.data();
            marcadorSuperior.innerHTML = `<span>Tu Record Histórico: <b style="color:#22c55e;">${datos.puntosTotales || 0} Pts</b></span>`;
        }
    });
}

// --- VALIDADOR EN TIEMPO REAL PARA EL BOTÓN STOP ---
const inputsJuego = document.querySelectorAll('.input-juego');
inputsJuego.forEach(input => {
    input.addEventListener('input', () => {
        let todosLlenos = true;
        inputsJuego.forEach(i => {
            if (i.value.trim() === "") {
                todosLlenos = false;
            }
        });

        if (todosLlenos) {
            btnStop.disabled = false;
            btnStop.style.opacity = "1";
            btnStop.style.cursor = "pointer";
        } else {
            btnStop.disabled = true;
            btnStop.style.opacity = "0.5";
            btnStop.style.cursor = "not-allowed";
        }
    });
});

// --- 2. LOGICA DE EMPAREJAMIENTO PÚBLICO ---
document.getElementById('btn-buscar-publica').addEventListener('click', async () => {
    lobbyOptions.classList.add('hidden');
    matchmakingStatus.classList.remove('hidden');
    
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

    const q = query(collection(db, "partidas"), where("tipo", "==", "privada"), where("pin", "==", pin), where("estado", "==", "esperando"));
    const querySnapshot = await getDocs(q);

    if(!querySnapshot.empty) {
        const partidaDoc = querySnapshot.docs[0];
        idPartidaActiva = partidaDoc.id;
        
        await updateDoc(doc(db, "partidas", idPartidaActiva), {
            jugadores: arrayUnion(miNombre),
            estado: "esperando"
        });
        pinJoinBox.classList.add('hidden');
        lobbyOptions.classList.add('hidden');
        conectarAlJuego(idPartidaActiva);
    } else {
        alert("La sala privada no existe o la ronda ya ha comenzado.");
    }
});

document.getElementById('btn-cancelar-busqueda').addEventListener('click', async () => {
    if(idPartidaActiva) {
        if(desescribirListener) desescribirListener();
        await updateDoc(doc(db, "partidas", idPartidaActiva), { estado: "cancelada" });
    }
    matchmakingStatus.classList.add('hidden');
    lobbyOptions.classList.remove('hidden');
    idPartidaActiva = null;
    if(auth.currentUser) conectarMisPuntosPermanentes(auth.currentUser.uid);
});

// --- 5. ESCUCHA ACTIVA DE LA PARTIDA ---
function conectarAlJuego(idSala) {
    const salaRef = doc(db, "partidas", idSala);
    if(desescribirListener) desescribirListener();

    desescribirListener = onSnapshot(salaRef, async (snapshot) => {
        if (!snapshot.exists()) return;
        const datos = snapshot.data();

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
            
            revanchaBox.classList.add('hidden');
            btnVolverLobby.classList.remove('hidden');
            
            // Forzar reseteo del estado del botón STOP para la nueva partida
            btnStop.disabled = true;
            btnStop.style.opacity = "0.5";
            btnStop.style.cursor = "not-allowed";
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
            
            renderizarTablaYMarcadores(datos.respuestas, datos.letra, datos.jugadores);

            const votos = datos.votosRevancha || {};
            const miVoto = votos[miNombre];
            const otrosVotosSi = Object.keys(votos).filter(p => p !== miNombre && votos[p] === "si");

            if (datos.estadoRevancha === "procesando") {
                btnVolverLobby.classList.add('hidden');
                revanchaBox.classList.remove('hidden');

                if (miVoto === "si") {
                    revanchaTexto.textContent = "Esperando respuesta de tu rival...";
                    revanchaBotones.classList.add('hidden');
                } else if (otrosVotosSi.length > 0) {
                    revanchaTexto.textContent = `¡Te han pedido una revancha! ¿Aceptas?`;
                    revanchaBotones.classList.remove('hidden');
                } else {
                    revanchaTexto.textContent = "¿Quieres una revancha con este grupo?";
                    revanchaBotones.classList.remove('hidden');
                }
            } else {
                btnVolverLobby.classList.remove('hidden');
                revanchaBox.classList.add('hidden');
            }
            
            if (datos.estadoRevancha === "rechazada") {
                if (miVoto === "si") {
                    alert("La revancha fue cancelada o rechazada.");
                }
                irAlInicio();
            }
        }
    });
}

// --- 6. RENDER DE TABLAS Y MARCADORES ---
async function renderizarTablaYMarcadores(respuestas, letraActiva, listaJugadores) {
    if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
        if (userDoc.exists()) {
            marcadorSuperior.innerHTML = `<span>Tu Record Histórico: <b style="color:#22c55e;">${userDoc.data().puntosTotales || 0} Pts</b></span>`;
        }
    }

    const tbody = document.getElementById('results-body');
    tbody.innerHTML = "";
    
    const tablaPuntosRonda = calcularPuntosRonda(respuestas, letraActiva);

    if (letraActiva !== ultimaLetraProcesada && Object.keys(respuestas).length >= listaJugadores.length) {
        ultimaLetraProcesada = letraActiva;
        
        for (let jugador of Object.keys(tablaPuntosRonda)) {
            const puntosGanados = tablaPuntosRonda[jugador] || 0;
            if(puntosGanados > 0) {
                const qUser = query(collection(db, "usuarios"), where("nombre", "==", jugador));
                const snapUser = await getDocs(qUser);
                if(!snapUser.empty) {
                    await updateDoc(doc(db, "usuarios", snapUser.docs[0].id), {
                        puntosTotales: increment(puntosGanados)
                    });
                }
            }
        }
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
            <td>${r.animal || '-'}</td>
            <td style="color: #22c55e; font-weight: bold;">${tablaPuntosRonda[jugador] || 0} pts</td>
        `;
        tbody.appendChild(tr);
    });
}

function irAlInicio() {
    if(desescribirListener) desescribirListener();
    idPartidaActiva = null;
    revanchaBox.classList.add('hidden');
    screenResults.classList.add('hidden');
    screenLobby.classList.remove('hidden');
    lobbyOptions.classList.remove('hidden');
    lobbyWaiting.classList.add('hidden');
    if(auth.currentUser) conectarMisPuntosPermanentes(auth.currentUser.uid);
}

// --- 7. INICIAR RONDA ---
document.getElementById('btn-iniciar-juego').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    iniciarSiguienteRonda();
});

async function iniciarSiguienteRonda() {
    const letters = "ABCDEFGHIJLMNOPRSTUV";
    const randomLetter = letters[Math.floor(Math.random() * letters.length)];
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estado: "jugando",
        letra: randomLetter,
        quienPusoStop: "",
        respuestas: {},
        votosRevancha: {},
        estadoRevancha: ""
    });
}

// --- 8. ENVÍO DE RESPUESTAS INCLUYENDO ANIMAL ---
document.getElementById('btn-stop').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    const misRespuestas = {
        nombre: document.getElementById('ans-nombre').value.trim().toLowerCase() || '-',
        apellido: document.getElementById('ans-apellido').value.trim().toLowerCase() || '-',
        ciudad: document.getElementById('ans-ciudad').value.trim().toLowerCase() || '-',
        fruta: document.getElementById('ans-fruta').value.trim().toLowerCase() || '-',
        color: document.getElementById('ans-color').value.trim().toLowerCase() || '-',
        animal: document.getElementById('ans-animal').value.trim().toLowerCase() || '-'
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
            color: document.getElementById('ans-color').value.trim().toLowerCase() || '-',
            animal: document.getElementById('ans-animal').value.trim().toLowerCase() || '-'
        };
        await updateDoc(salaRef, { [`respuestas.${miNombre}`]: misRespuestas });
    }
}

// --- 9. MOTOR DE CÁLCULO DE PUNTOS ---
function calcularPuntosRonda(respuestas, letraActiva) {
    const jugadores = Object.keys(respuestas);
    const puntajes = {};
    const categories = ['nombre', 'apellido', 'ciudad', 'fruta', 'color', 'animal'];

    jugadores.forEach(j => puntajes[j] = 0);

    categories.forEach(cat => {
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

// --- 10. REINICIOS LIMPIOS DE REVANCHAS ---
document.getElementById('btn-volver-lobby').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estadoRevancha: "procesando",
        [`votosRevancha.${miNombre}`]: "si"
    });
});

document.getElementById('btn-revancha-si').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    document.getElementById('stop-form').reset();
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estado: "esperando",
        estadoRevancha: "",
        votosRevancha: {},
        respuestas: {},
        quienPusoStop: "",
        letra: ""
    });
});

document.getElementById('btn-revancha-no').addEventListener('click', async () => {
    if(!idPartidaActiva) return;
    
    await updateDoc(doc(db, "partidas", idPartidaActiva), {
        estadoRevancha: "rechazada",
        [`votosRevancha.${miNombre}`]: "no"
    });
    irAlInicio();
});
