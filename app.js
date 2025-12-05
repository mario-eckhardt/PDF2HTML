const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const editorContainer = document.getElementById('editor-container');
const editorContent = document.getElementById('editor-content');
const generateBtn = document.getElementById('generate-btn');
const resultContainer = document.getElementById('result-container');

function updateStatus(text, progress) {
    statusText.textContent = text;
    if (progress !== null) {
        progressBar.style.width = `${progress}%`;
    }
}
