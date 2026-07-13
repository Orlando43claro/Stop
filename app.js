import { db } from "./firebase-config.js";
import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let miNombre = "";
const salaDocRef = doc(db, "partidas", "sala_principal");

const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');
const screenResults = document.getElementById('screen-results');

// 1. Unirse al juego localmente
document.getElementById('btn-entrar').addEventListener('click', () => {
    const input = document.getElementById('username').value.trim();
    if(!input) return alert("Por favor ingresa tu nombre");
    miNombre = input;
    
    document.getElementById('login-box').classList.add('hidden');
    document.getElementById('lobby-status').classList.remove('hidden');
    document.getElementById('user-badge').textContent = `Jugador: ${miNombre}`;
});

// 2. Iniciar la Ronda (Elige letra y cambia estado)
document.getElementById('btn-iniciar-juego').addEventListener('click', async () => {
    const letras = "ABCDEFGHIJLMNOPRSTUV";
    const letraAleatoria = letras[Math.floor(Math.random() * letras.length)];
    
    try {
        await updateDoc(salaDocRef, {
            estado: "jugando",
            letra: letraAleatoria,
            quienPusoStop: "",
            respuestas: {} 
        });
    } catch (error) {
        console.error("Error al iniciar juego:", error);
    }
});

// 3. Capturar respuestas locales
function obtenerMisRespuestas() {
    return {
        nombre: document.getElementById('ans-nombre').value.trim() || '-',
        apellido: document.getElementById('ans-apellido').value.trim() || '-',
        ciudad: document.getElementById('ans-ciudad').value.trim() || '-',
        fruta: document.getElementById('ans-fruta').value.trim() || '-',
        color: document.getElementById('ans-color').value.trim() || '-'
    };
}

// 4. Botón ¡STOP!
document.getElementById('btn-stop').addEventListener('click', async () => {
    const misRespuestas = obtenerMisRespuestas();

    try {
        await updateDoc(salaDocRef, {
            estado: "resultados",
            quienPusoStop: miNombre,
            [`respuestas.${miNombre}`]: misRespuestas
        });
    } catch (error) {
        console.error("Error al enviar STOP:", error);
    }
});

// 5. Enviar datos de rezagados automáticamente si alguien más presionó STOP
async function enviarRespuestasTardias(respuestasActuales) {
    if (miNombre && !respuestasActuales[miNombre]) {
        const misRespuestas = obtenerMisRespuestas();
        try {
            await updateDoc(salaDocRef, {
                [`respuestas.${miNombre}`]: misRespuestas
            });
        } catch (e) {
            console.error("Error en envío tardío:", e);
        }
    }
}

// 6. Dibujar la tabla con lo que escribió cada jugador
function renderizarTabla(respuestas) {
    const tbody = document.getElementById('results-body');
    tbody.innerHTML = "";
    
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
        `;
        tbody.appendChild(tr);
    });
}

// 7. Oidor en Tiempo Real (Sincronización)
onSnapshot(salaDocRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const datos = snapshot.data();

    if (datos.estado === "esperando") {
        screenLobby.classList.remove('hidden');
        screenGame.classList.add('hidden');
        screenResults.classList.add('hidden');
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
        
        enviarRespuestasTardias(datos.respuestas);
        
        document.getElementById('stop-announcer').textContent = `¡Ronda detenida por: ${datos.quienPusoStop}!`;
        renderizarTabla(datos.respuestas);
    }
});

// 8. Volver a jugar (Nueva Ronda)
document.getElementById('btn-volver-lobby').addEventListener('click', async () => {
    document.getElementById('stop-form').reset();
    try {
        await updateDoc(salaDocRef, { estado: "esperando" });
    } catch (error) {
        console.error("Error al reiniciar sala:", error);
    }
});
