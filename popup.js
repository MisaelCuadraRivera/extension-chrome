document.addEventListener("DOMContentLoaded", function () {
    const courseList = document.getElementById("course-list");
    const taskList = document.getElementById("task-list");
    const generarContenidoBtn = document.getElementById("generar-contenido");
    const cargarCursosBtn = document.getElementById("cargar-cursos");
    const entregarTareaBtn = document.getElementById("entregar-tarea");
    const formatSelect = document.getElementById("format-select");

    let cursos = {};
    let selectedCourse = null;
    let selectedTask = null;

    const quill = new Quill('#editor-container', {
        theme: 'snow',
        placeholder: 'Aquí aparecerá el contenido generado y podrás editarlo...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'script': 'sub' }, { 'script': 'super' }],
                [{ 'indent': '-1' }, { 'indent': '+1' }],
                [{ 'direction': 'rtl' }],
                [{ 'size': ['small', false, 'large', 'huge'] }],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],
                ['link', 'image', 'video'],
                ['clean']
            ]
        }
    });

    document.getElementById("iniciar-sesion").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "authenticate" }, (response) => {
            if (response && response.success) {
                console.log("Usuario autenticado con éxito");
            } else {
                console.error("Error en la autenticación");
            }
        });
    });

    document.getElementById("cerrar-sesion").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "logout" }, (response) => {
            if (response && response.success) {
                console.log("Sesión cerrada correctamente");
            } else {
                console.error("Error al cerrar sesión");
            }
        });
    });

    cargarCursosBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "getAssignments" }, (response) => {
            if (response && response.success && response.data) {
                displayCourses(response.data);
            } else {
                alert("Error al cargar los cursos. Inténtalo de nuevo.");
            }
        });
    });

    function displayCourses(cursosData) {
        courseList.innerHTML = '';
        cursos = cursosData || {};

        if (Object.keys(cursos).length === 0) {
            courseList.innerHTML = '<p class="text-muted text-center">No hay cursos disponibles.</p>';
        } else {
            Object.keys(cursos).forEach(courseName => {
                const courseItem = document.createElement("div");
                courseItem.className = "course-item p-2";
                courseItem.textContent = courseName;
                courseItem.style.cursor = "pointer";

                courseItem.addEventListener("click", () => {
                    selectedCourse = cursos[courseName];
                    displayTasks(selectedCourse);
                    highlightSelection(courseItem, courseList);
                    console.log ('Hola',selectedCourse);
                });

                courseList.appendChild(courseItem);
            });
        }
    }

    function displayTasks(tasks) {
        taskList.innerHTML = '';
        selectedTask = null;
    
        if (!tasks || tasks.length === 0) {
            taskList.innerHTML = '<p class="text-muted text-center">No hay tareas disponibles para este curso.</p>';
        } else {
            tasks.forEach(task => {
                const taskItem = document.createElement("div");
                taskItem.className = "task-item p-2";
                taskItem.textContent = task.title;
                taskItem.style.cursor = "pointer";
    
                taskItem.addEventListener("click", () => {
                    selectedTask = task;  
                    highlightSelection(taskItem, taskList);
                    console.log("Tarea seleccionada:", selectedTask); 
                });
    
                taskList.appendChild(taskItem);
            });
        }
    }

    function highlightSelection(selectedElement, container) {
        Array.from(container.children).forEach(child => {
            child.classList.remove("selected");
        });
        selectedElement.classList.add("selected");
    }
    

    generarContenidoBtn.addEventListener("click", () => {
        if (selectedCourse && selectedTask) {
            const taskDescription = selectedTask.description;
            chrome.runtime.sendMessage({ action: "generateContent", descripcionTarea: taskDescription }, (response) => {
                if (response.success && response.contenido) {
                    quill.setText(response.contenido);
                } else {
                    alert("Error al generar contenido.");
                }
            });
        } else {
            alert("Selecciona un curso y una tarea válidos para generar contenido.");
        }
    });

    const PDFDocument = window.PDFLib ? window.PDFLib.PDFDocument : undefined;

    async function convertirAFormato(contenido, formato) {
        if (formato === "pdf") {
            if (!PDFDocument) {
                console.error("PDFDocument no está definido. Verifica que pdf-lib esté correctamente cargado.");
                return;
            }
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage();
            page.drawText(contenido, { x: 50, y: 700, size: 12 });
            const pdfBytes = await pdfDoc.save();
            return new Blob([pdfBytes], { type: "application/pdf" });
        } else if (formato === "docx") {
            const { Document, Packer, Paragraph, TextRun } = window.docx;
            if (!Document || !Packer) {
                console.error("Docx no está definido. Verifica que docx esté correctamente cargado.");
                return;
            }
            const doc = new Document();
            doc.addSection({
                children: [
                    new Paragraph({
                        children: [new TextRun(contenido)],
                    }),
                ],
            });
            const buffer = await Packer.toBlob(doc);
            return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        }
    }

    entregarTareaBtn.addEventListener("click", async () => {
        const contenido = quill.root.innerHTML;
        const formato = formatSelect.value; 
    
        if (selectedTask) {
            const courseId = selectedTask.courseId;
            const taskId = selectedTask.id;
    
            console.log("Datos enviados a background.js para entregar tarea:", {
                courseId: courseId,
                taskId: taskId,
                contenido: contenido,
                formato: formato
            });
    
            chrome.runtime.sendMessage({
                action: "entregarTarea",
                courseId: courseId,
                taskId: taskId,
                contenido: contenido,
                formato: formato
            }, (response) => {
                if (response && response.success) {
                    alert(response.message);
                } else {
                    console.error("Error al entregar la tarea:", response ? response.error : "Respuesta indefinida");
                    alert(response.error || "Error desconocido al entregar la tarea.");
                }
            });
        } else {
            alert("Por favor, selecciona un curso y una tarea.");
        }
    });
});
