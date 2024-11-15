// Función para iniciar la autenticación y obtener el token
function authenticateUser(callback) {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
        if (chrome.runtime.lastError) {
            console.error("Error de autenticación:", chrome.runtime.lastError);
            if (callback) callback({ success: false });
            return;
        }
        console.log("Token de acceso obtenido:", token);
        if (callback) callback({ success: true, token });
    });
}

// Escucha mensajes del popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "authenticate") {
        authenticateUser(sendResponse);
        return true;
    } else if (message.action === "getAssignments") {
        chrome.identity.getAuthToken({ interactive: true }, function (token) {
            if (chrome.runtime.lastError) {
                console.error("Error al obtener el token:", chrome.runtime.lastError);
                sendResponse({ success: false });
                return;
            }
            getClassroomAssignments(token, sendResponse);
        });
        return true;
    } else if (message.action === "logout") {
        chrome.identity.getAuthToken({ interactive: false }, function (token) {
            if (chrome.runtime.lastError) {
                console.error("Error al obtener el token:", chrome.runtime.lastError);
                sendResponse({ success: false });
                return;
            }
            revokeToken(token, sendResponse);
        });
        return true;
    } else if (message.action === "generateContent") {
        generarContenidoConCohere(message.descripcionTarea)
            .then(contenido => {
                if (contenido) {
                    sendResponse({ success: true, contenido });
                } else {
                    sendResponse({ success: false, error: "No se pudo generar el contenido." });
                }
            })
            .catch(error => {
                console.error("Error en la generación de contenido:", error);
                sendResponse({ success: false, error: "Error al procesar la solicitud de generación de contenido." });
            });
        return true;
    } else if (message.action === "entregarTarea") {
        console.log("Datos recibidos para entregar tarea:", {
            courseId: message.courseId,
            taskId: message.taskId,
            contenido: message.contenido,
            formato: message.formato
        });
        entregarTarea(message.courseId, message.taskId, message.contenido, message.formato, sendResponse);
        return true;
    }
});

// Función para revocar el token actual
function revokeToken(token, sendResponse) {
    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`, {
        method: "POST"
    })
    .then(response => {
        if (response.ok) {
            console.log("Token revocado con éxito");
            chrome.identity.removeCachedAuthToken({ token: token }, () => {
                console.log("Token eliminado del cache de Chrome");
                sendResponse({ success: true });
            });
        } else {
            console.error("Error al revocar el token");
            sendResponse({ success: false });
        }
    })
    .catch(error => {
        console.error("Error al revocar el token:", error);
        sendResponse({ success: false });
    });
}

// Función para obtener las asignaciones en Google Classroom
function getClassroomAssignments(token, sendResponse) {
    const url = "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE";

    fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
    })
    .then(response => response.json())
    .then(data => {
        let tareasPorCurso = {};
        if (data.courses && data.courses.length > 0) {
            let cursosProcesados = 0;

            data.courses.forEach(course => {
                fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork`, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${token}` }
                })
                .then(response => response.json())
                .then(tasksData => {
                    const tareasPendientes = (tasksData.courseWork || []).filter(task => {
                        if (task.state === "PUBLISHED" && task.dueDate) {
                            const dueDate = new Date(task.dueDate.year, task.dueDate.month - 1, task.dueDate.day);
                            return dueDate >= new Date();
                        }
                        return false;
                    });

                    if (tareasPendientes.length > 0) {
                        tareasPorCurso[course.name] = tareasPendientes;
                    }
                    cursosProcesados++;
                    if (cursosProcesados === data.courses.length) {
                        sendResponse({ success: true, data: tareasPorCurso });
                    }
                })
                .catch(error => {
                    console.error("Error al obtener las tareas:", error);
                    cursosProcesados++;
                    if (cursosProcesados === data.courses.length) {
                        sendResponse({ success: true, data: tareasPorCurso });
                    }
                });
            });
        } else {
            sendResponse({ success: true, data: {} });
        }
    })
    .catch(error => {
        console.error("Error al obtener los cursos:", error);
        sendResponse({ success: false, error: "Error al obtener los cursos." });
    });
}

// Función para generar contenido con Cohere
const cohereApiKey = "O5ZP0Umk3FGKZRKhRtZj2DoebGl5QuvDu6p8fwvc";

async function generarContenidoConCohere(descripcionTarea) {
    try {
        const url = "https://api.cohere.ai/v1/generate";
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cohereApiKey}`
            },
            body: JSON.stringify({
                model: "command-xlarge-nightly",
                prompt: `Genera contenido para la siguiente tarea: ${descripcionTarea}`,
                max_tokens: 300,
                temperature: 0.7,
            })
        });

        const data = await response.json();

        if (data.generations && data.generations.length > 0) {
            return data.generations[0].text;
        } else {
            console.error("Respuesta inesperada de Cohere API:", data);
            return "No se pudo generar el contenido. Respuesta inesperada de la API de Cohere.";
        }

    } catch (error) {
        console.error("Error al generar contenido con Cohere:", error);
        return "Error al conectar con la API de Cohere.";
    }
}

function entregarTarea(courseId, taskId, contenido, formato, sendResponse) {
    if (!courseId || !taskId) {
        console.error("courseId o taskId no están definidos. No se puede entregar la tarea.");
        sendResponse({ success: false, error: "courseId o taskId no están definidos." });
        return;
    }

    chrome.identity.getAuthToken({ interactive: true }, token => {
        if (chrome.runtime.lastError || !token) {
            console.error("Error al obtener el token de autenticación:", chrome.runtime.lastError);
            sendResponse({ success: false, error: "Error al obtener el token de autenticación." });
            return;
        }

        console.log("Intentando entregar la tarea con los siguientes datos:", {
            courseId,
            taskId,
            contenido,
            formato
        });

        const url = `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${taskId}/turnIn`;

        fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })
        .then(response => {
            if (response.ok) {
                console.log("Tarea entregada con éxito.");
                sendResponse({ success: true, message: "Tarea entregada con éxito." });
            } else {
                response.text().then(text => {
                    try {
                        const errorData = JSON.parse(text);
                        console.error("Error en la entrega de tarea:", errorData);
                        sendResponse({ success: false, error: errorData });
                    } catch (e) {
                        console.error("Error en la entrega de tarea. Respuesta sin detalles y no es JSON:", text);
                        sendResponse({ success: false, error: "Error desconocido sin detalles." });
                    }
                });
            }
        })
        .catch(error => {
            console.error("Error al intentar entregar la tarea:", error);
            sendResponse({ success: false, error: "Error desconocido al intentar entregar la tarea." });
        });
    });
}
