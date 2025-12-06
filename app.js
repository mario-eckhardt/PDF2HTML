const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const editorContainer = document.getElementById('editor-container');
const editorContent = document.getElementById('editor-content');
const generateBtn = document.getElementById('generate-btn');
const resultContainer = document.getElementById('result-container');
const previewContent = document.getElementById('preview-content');
const progressBar = document.getElementById('progress-bar');
const progressBarContainer = document.getElementById('progress-bar-container');
const resetBtn = document.getElementById('reset-btn');
const downloadBtn = document.getElementById('download-btn');

// Style Sidebar Elements
const styleSidebar = document.getElementById('style-sidebar');
const fontFamilySelect = document.getElementById('font-family-select');
const fontSizeInput = document.getElementById('font-size-input');
const alignBtns = document.querySelectorAll('.btn-icon[data-align]');
const applyStyleBtn = document.getElementById('apply-style-btn');

let currentPdfName = 'document';
let currentPdfDoc = null;
let pagesData = []; // [{ pageNum, viewport, canvas, regions: [] }]
let generatedHtmlBody = '';
let extractedImages = [];
let selectedRegion = null; // The currently selected region for editing styles

// Event Listeners
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        handleFile(file);
    } else {
        alert('Please upload a valid PDF file.');
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

resetBtn.addEventListener('click', () => {
    resultContainer.classList.add('hidden');
    editorContainer.classList.add('hidden');
    uploadArea.classList.remove('hidden');
    fileInput.value = '';
    previewContent.innerHTML = '';
    editorContent.innerHTML = '';
    pagesData = [];
    extractedImages = [];
    selectedRegion = null;
    styleSidebar.classList.add('hidden');
});

generateBtn.addEventListener('click', generateFinalHtml);
downloadBtn.addEventListener('click', downloadZip);

// Style Sidebar Listeners
fontFamilySelect.addEventListener('change', (e) => {
    if (selectedRegion && selectedRegion.type === 'text') {
        selectedRegion.style.fontFamily = e.target.value;
    }
});

fontSizeInput.addEventListener('change', (e) => {
    if (selectedRegion && selectedRegion.type === 'text') {
        selectedRegion.style.fontSize = parseInt(e.target.value, 10);
    }
});

alignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (selectedRegion && selectedRegion.type === 'text') {
            const align = btn.getAttribute('data-align');
            selectedRegion.style.textAlign = align;
            updateSidebarUI(selectedRegion);
        }
    });
});

applyStyleBtn.addEventListener('click', () => {
    if (selectedRegion && selectedRegion.type === 'text') {
        const style = selectedRegion.style;
        // Apply to ALL text regions
        pagesData.forEach(page => {
            page.regions.forEach(r => {
                if (r.type === 'text') {
                    r.style = { ...style };
                }
            });
        });
        alert('Style applied to all text regions!');
    }
});

async function handleFile(file) {
    uploadArea.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    progressBarContainer.classList.remove('hidden');
    updateStatus('Analyzing PDF...', 0);

    currentPdfName = file.name.replace('.pdf', '');
    pagesData = [];

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        currentPdfDoc = pdf;
        const totalPages = pdf.numPages;

        for (let i = 1; i <= totalPages; i++) {
            updateStatus(`Analyzing page ${i} of ${totalPages}...`, (i / totalPages) * 100);
            const page = await pdf.getPage(i);
            const pageData = await analyzePage(page, i);
            pagesData.push(pageData);
        }

        renderEditor();
        statusContainer.classList.add('hidden');
        editorContainer.classList.remove('hidden');

    } catch (error) {
        console.error(error);
        alert('Error processing PDF: ' + error.message);
        statusContainer.classList.add('hidden');
        uploadArea.classList.remove('hidden');
    }
}

async function analyzePage(page, pageNum) {
    const scale = 1.5; // Good quality for review
    const viewport = page.getViewport({ scale: scale });

    // 1. Render to Canvas (for background)
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    // 2. Detect Regions
    const regions = [];

    // A. Text Regions
    const textContent = await page.getTextContent();
    // Group text items into lines/blocks (simplified)
    textContent.items.forEach(item => {
        const tx = item.transform;
        const x = tx[4];
        const y = tx[5];
        const w = item.width;
        const h = item.height || Math.abs(tx[3]); // Fallback to scaleY (font size)

        // Convert to viewport (canvas) coords
        const rect = viewport.convertToViewportRectangle([x, y, x + w, y + h]);

        const minX = Math.min(rect[0], rect[2]);
        const maxX = Math.max(rect[0], rect[2]);
        const minY = Math.min(rect[1], rect[3]);
        const maxY = Math.max(rect[1], rect[3]);

        // Heuristic for Font Family/Size
        let fontFamily = 'Arial, sans-serif';
        if (item.fontName.toLowerCase().includes('times')) fontFamily = "'Times New Roman', serif";
        if (item.fontName.toLowerCase().includes('courier')) fontFamily = "'Courier New', monospace";

        // Calculate Font Size in Pixels (approx)
        const fontSize = Math.round(Math.abs(tx[3]) * scale);

        regions.push({
            type: 'text',
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            active: true,
            content: item.str,
            style: {
                fontFamily: fontFamily,
                fontSize: fontSize > 0 ? fontSize : 16,
                textAlign: 'left'
            }
        });
    });

    // Merge overlapping text regions
    const mergedTextRegions = mergeRegions(regions.filter(r => r.type === 'text'));

    // B. Image Regions (Standard + Segmentation)
    const imageRegions = await detectImageRegions(page, canvas, pageNum, viewport);

    return {
        pageNum,
        viewport,
        canvas, // The rendered background
        regions: [...mergedTextRegions, ...imageRegions]
    };
}

function mergeRegions(regions) {
    regions.sort((a, b) => a.y - b.y || a.x - b.x);

    const merged = [];
    if (regions.length === 0) return merged;

    let current = { ...regions[0] };

    for (let i = 1; i < regions.length; i++) {
        const next = regions[i];

        const verticalOverlap = (current.y < next.y + next.height) && (current.y + current.height > next.y);
        const sameLine = Math.abs(current.y - next.y) < 10;

        if (sameLine || verticalOverlap) {
            if (next.x < current.x + current.width + 20) {
                const minX = Math.min(current.x, next.x);
                const minY = Math.min(current.y, next.y);
                const maxX = Math.max(current.x + current.width, next.x + next.width);
                const maxY = Math.max(current.y + current.height, next.y + next.height);

                current.x = minX;
                current.y = minY;
                current.width = maxX - minX;
                current.height = maxY - minY;
                current.content += ' ' + next.content;
                // Preserve first style
                continue;
            }
        }

        merged.push(current);
        current = { ...next };
    }
    merged.push(current);
    return merged;
}

async function detectImageRegions(page, canvas, pageNum, viewport) {
    const regions = [];

    // Visual Segmentation
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const gridSize = 10;
    const cols = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);
    const grid = new Uint8Array(cols * rows);

    for (let y = 0; y < height; y += gridSize) {
        for (let x = 0; x < width; x += gridSize) {
            let nonWhitePixels = 0;
            let totalPixels = 0;
            for (let cy = 0; cy < gridSize && y + cy < height; cy++) {
                for (let cx = 0; cx < gridSize && x + cx < width; cx++) {
                    const off = ((y + cy) * width + (x + cx)) * 4;
                    if (data[off] < 240 || data[off + 1] < 240 || data[off + 2] < 240) {
                        nonWhitePixels++;
                    }
                    totalPixels++;
                }
            }
            if (nonWhitePixels / totalPixels > 0.1) {
                grid[Math.floor(y / gridSize) * cols + Math.floor(x / gridSize)] = 1;
            }
        }
    }

    const visited = new Uint8Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
        if (grid[i] === 1 && visited[i] === 0) {
            const region = { minX: cols, minY: rows, maxX: 0, maxY: 0 };
            const stack = [i];
            visited[i] = 1;
            while (stack.length > 0) {
                const idx = stack.pop();
                const gx = idx % cols;
                const gy = Math.floor(idx / cols);
                region.minX = Math.min(region.minX, gx);
                region.minY = Math.min(region.minY, gy);
                region.maxX = Math.max(region.maxX, gx);
                region.maxY = Math.max(region.maxY, gy);

                const neighbors = [idx - 1, idx + 1, idx - cols, idx + cols];
                for (const nIdx of neighbors) {
                    if (nIdx >= 0 && nIdx < cols * rows && grid[nIdx] === 1 && visited[nIdx] === 0) {
                        if (Math.abs((nIdx % cols) - (idx % cols)) > 1) continue;
                        visited[nIdx] = 1;
                        stack.push(nIdx);
                    }
                }
            }

            const rWidth = (region.maxX - region.minX + 1) * gridSize;
            const rHeight = (region.maxY - region.minY + 1) * gridSize;

            const rect = {
                x: region.minX * gridSize,
                y: region.minY * gridSize,
                width: rWidth,
                height: rHeight
            };

            if (rWidth > 50 && rHeight > 50) {
                regions.push({
                    type: 'image',
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    active: true
                });
            }
        }
    }

    return regions;
}

function renderEditor() {
    editorContent.innerHTML = '';

    pagesData.forEach((pageData, index) => {
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'editor-page';
        pageWrapper.style.width = `${pageData.canvas.width}px`;
        pageWrapper.style.height = `${pageData.canvas.height}px`;

        pageWrapper.appendChild(pageData.canvas);

        pageData.regions.forEach(region => {
            createRegionElement(region, pageWrapper);
        });

        editorContent.appendChild(pageWrapper);
    });
}

function createRegionElement(region, parent) {
    const box = document.createElement('div');
    box.className = `region-box ${region.type} ${region.active ? '' : 'inactive'}`;
    updateBoxStyle(box, region);

    box.addEventListener('click', (e) => {
        if (e.target !== box) return;

        selectedRegion = region;

        if (region.type === 'text') {
            styleSidebar.classList.remove('hidden');
            updateSidebarUI(region);
        } else {
            styleSidebar.classList.add('hidden');
        }

        region.active = !region.active;
        box.classList.toggle('inactive', !region.active);
    });

    box.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        region.type = region.type === 'text' ? 'image' : 'text';
        box.className = `region-box ${region.type} ${region.active ? '' : 'inactive'}`;

        if (region.type === 'text' && !region.style) {
            region.style = {
                fontFamily: 'Arial, sans-serif',
                fontSize: 16,
                textAlign: 'left'
            };
        }
    });

    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(pos => {
        const handle = document.createElement('div');
        handle.className = `resize-handle handle-${pos}`;
        box.appendChild(handle);
        handle.addEventListener('mousedown', (e) => initResize(e, region, box, pos));
    });

    parent.appendChild(box);
}

function updateSidebarUI(region) {
    if (!region.style) return;
    fontFamilySelect.value = region.style.fontFamily;
    fontSizeInput.value = region.style.fontSize;

    alignBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-align') === region.style.textAlign);
    });
}

function updateBoxStyle(box, region) {
    box.style.left = `${region.x}px`;
    box.style.top = `${region.y}px`;
    box.style.width = `${region.width}px`;
    box.style.height = `${region.height}px`;
}

function initResize(e, region, box, pos) {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...region };

    function onMouseMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (pos.includes('e')) region.width = Math.max(10, startRect.width + dx);
        if (pos.includes('s')) region.height = Math.max(10, startRect.height + dy);
        if (pos.includes('w')) {
            const newWidth = Math.max(10, startRect.width - dx);
            region.x = startRect.x + (startRect.width - newWidth);
            region.width = newWidth;
        }
        if (pos.includes('n')) {
            const newHeight = Math.max(10, startRect.height - dy);
            region.y = startRect.y + (startRect.height - newHeight);
            region.height = newHeight;
        }

        updateBoxStyle(box, region);
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

async function generateFinalHtml() {
    editorContainer.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    updateStatus('Generating HTML...', 0);

    let fullHtml = '';
    extractedImages = [];

    for (let i = 0; i < pagesData.length; i++) {
        const pageData = pagesData[i];
        const pageNum = pageData.pageNum;
        let pageHtml = '';

        const activeRegions = pageData.regions.filter(r => r.active).sort((a, b) => a.y - b.y);

        for (const region of activeRegions) {
            if (region.type === 'image') {
                const blob = await cropImage(pageData.canvas, region);
                const filename = `image-${pageNum}-${extractedImages.length + 1}.png`;
                extractedImages.push({ filename, blob });
                const previewUrl = URL.createObjectURL(blob);
                pageHtml += `<img src="${previewUrl}" alt="Segmented Image" class="pdf-image" data-filename="${filename}">`;
            } else {
                const style = region.style || { fontFamily: 'Arial', fontSize: 16, textAlign: 'left' };
                const styleStr = `font-family: ${style.fontFamily}; font-size: ${style.fontSize}px; text-align: ${style.textAlign};`;

                if (region.content) {
                    pageHtml += `<p style="${styleStr}">${region.content}</p>`;
                } else {
                    const blob = await cropImage(pageData.canvas, region);
                    const text = await performOCR(blob);
                    pageHtml += `<div style="${styleStr}">${text}</div>`;
                }
            }
        }

        fullHtml += `<div class="pdf-page" id="page-${pageNum}">${pageHtml}</div>`;
    }

    generatedHtmlBody = fullHtml;
    previewContent.innerHTML = fullHtml;

    statusContainer.classList.add('hidden');
    resultContainer.classList.remove('hidden');
}

async function cropImage(sourceCanvas, region) {
    const canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(sourceCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function performOCR(blob) {
    const worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(blob);
    await worker.terminate();
    return text.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('');
}

async function downloadZip() {
    const zip = new JSZip();

    const imgFolder = zip.folder("images");
    extractedImages.forEach(img => {
        imgFolder.file(img.filename, img.blob);
    });

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = generatedHtmlBody;
    const images = tempDiv.getElementsByTagName('img');
    for (let img of images) {
        const filename = img.getAttribute('data-filename');
        if (filename) {
            img.src = `images/${filename}`;
        }
    }

    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${currentPdfName}</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }
        .pdf-page { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 2rem; }
        img { max-width: 100%; height: auto; margin: 1rem 0; }
    </style>
</head>
<body>
    <h1>${currentPdfName}</h1>
    ${tempDiv.innerHTML}
</body>
</html>`;

    zip.file("index.html", fullHtml);

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${currentPdfName}-converted.zip`;
    link.click();
}

function updateStatus(text, progress) {
    statusText.textContent = text;
    if (progress !== null) {
        progressBar.style.width = `${progress}%`;
    }
}
