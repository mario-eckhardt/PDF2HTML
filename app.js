const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const editorContainer = document.getElementById('editor-container');
const editorContent = document.getElementById('editor-content');
const generateBtn = document.getElementById('generate-btn');
const resultContainer = document.getElementById('result-container');


// Event Listeners
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

function handleFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file.');
        return;
    }

    console.log('File selected:', file.name);
    console.log('File selected:', file.name);

    statusContainer.classList.remove('hidden');
    updateStatus(`Processing ${file.name}...`, 0);

    const fileReader = new FileReader();

    fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);

        try {
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const totalPages = pdf.numPages;
            console.log(`PDF loaded. Total pages: ${totalPages}`);

            const previewContent = document.getElementById('preview-content');
            previewContent.innerHTML = ''; // Clear previous content

            for (let i = 1; i <= totalPages; i++) {
                updateStatus(`Processing page ${i} of ${totalPages}...`, ((i / totalPages) * 100));

                const page = await pdf.getPage(i);

                // Create a container for the page
                const pageDiv = document.createElement('div');
                pageDiv.className = 'pdf-page';
                pageDiv.style.marginBottom = '20px';
                pageDiv.style.border = '1px solid #ddd';
                pageDiv.style.padding = '20px';
                // pageDiv.style.position = 'relative'; // Important for validation later if we do overlay

                // 1. Render Page to Canvas (for visual reference)
                const scale = 1.5;
                const viewport = page.getViewport({ scale: scale });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.style.maxWidth = '100%';

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                pageDiv.appendChild(canvas);

                // 2. Extract Text
                const textContent = await page.getTextContent();
                const textDiv = document.createElement('div');
                textDiv.className = 'text-layer';
                textDiv.style.marginTop = '10px';

                // Simple text rendering for now
                let pageText = '';
                textContent.items.forEach(item => {
                    pageText += item.str + ' ';
                });

                const p = document.createElement('p');
                p.textContent = pageText;
                textDiv.appendChild(p);
                pageDiv.appendChild(textDiv);

                previewContent.appendChild(pageDiv);
            }

            statusContainer.classList.add('hidden');
            console.log('Conversion complete');

        } catch (error) {
            console.error('Error processing PDF:', error);
            updateStatus('Error processing PDF. See console.', 0);
            alert('Error processing PDF. Please check the file.');
            statusContainer.classList.add('hidden');
        }
    };

    fileReader.readAsArrayBuffer(file);
}

function updateStatus(text, progress) {
    statusText.innerText = text; // Changed to innerText to be safe
    // Note: ProgressBar was referenced but not defined in the original snippet. 
    // Assuming we might need to add it or it's missing from the vars.
    // For now, I'll comment out the progress bar update to avoid errors if it doesn't exist.
    // if (progress !== null && typeof progressBar !== 'undefined') {
    //    progressBar.style.width = `${progress}%`;
    // }
}
