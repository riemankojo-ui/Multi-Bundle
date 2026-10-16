const STORAGE_KEY = "multiBundleBackups";

let selectedFiles = [];
let currentBundle = "";
let currentFilename = "";

// Supported text-based code files
const supportedExtensions = [
    "html", "htm", "css", "js", "json",
    "txt", "md", "xml", "svg", "php",
    "py", "sql", "yml", "yaml", "toml"
];

// Navigation
function openTab(tabName) {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });

    document.querySelectorAll(".nav").forEach(button => {
        button.classList.remove("active");
    });

    document.getElementById(tabName).classList.add("active");

    const navButton = document.querySelector(
        `.nav[data-tab="${tabName}"]`
    );

    if (navButton) {
        navButton.classList.add("active");
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    renderAll();
}

// Read saved backup records
function getBackups() {
    try {
        return JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );
    } catch {
        return [];
    }
}

// Save backup records
function saveBackups(backups) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(backups)
    );
}

// Safe HTML display
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// Create a safe filename
function safeFilename(value) {
    return value
        .trim()
        .replace(/[^a-z0-9_-]/gi, "_") || "My_Project";
}

// Format file size
function formatSize(bytes) {
    if (bytes < 1024) {
        return bytes + " B";
    }

    return (bytes / 1024).toFixed(1) + " KB";
}

// Download a text file
function downloadText(filename, content) {
    const blob = new Blob(
        [content],
        { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

// Select files
document.getElementById("codeFiles")
    .addEventListener("change", function () {

        selectedFiles = Array.from(this.files || []);

        currentBundle = "";

        document.getElementById("previewArea").hidden = true;

        renderSelectedFiles();

        document.getElementById("status").textContent = "";
    });

// Show selected files
function renderSelectedFiles() {
    const container =
        document.getElementById("selectedFiles");

    if (!selectedFiles.length) {
        container.textContent = "No files selected.";
        return;
    }

    container.innerHTML = selectedFiles.map(file => `
        <div class="file-item">
            <div class="item-name">
                ${escapeHTML(file.name)}
            </div>

            <div class="item-info">
                ${formatSize(file.size)}
            </div>
        </div>
    `).join("");
}

// Clear selection
function clearFiles() {
    selectedFiles = [];
    currentBundle = "";

    document.getElementById("codeFiles").value = "";
    document.getElementById("previewArea").hidden = true;
    document.getElementById("status").textContent = "";

    renderSelectedFiles();
}

// Generate TXT backup
async function generateBundle() {
    const projectName =
        document.getElementById("projectName").value.trim();

    const status = document.getElementById("status");

    if (!projectName) {
        status.textContent = "Please enter a project name.";
        return;
    }

    if (!selectedFiles.length) {
        status.textContent = "Please select your code files.";
        return;
    }

    status.textContent = "Preparing your backup...";

    const includedFiles = [];
    const skippedFiles = [];

    for (const file of selectedFiles) {
        const extension = file.name
            .split(".")
            .pop()
            .toLowerCase();

        if (!supportedExtensions.includes(extension)) {
            skippedFiles.push(file.name);
            continue;
        }

        // Avoid accidentally reading very large files
        if (file.size > 2 * 1024 * 1024) {
            skippedFiles.push(file.name + " (over 2 MB)");
            continue;
        }

        try {
            const content = await file.text();

            includedFiles.push(
                "========================================\n" +
                "FILE NAME: " + file.name + "\n" +
                "FILE SIZE: " + file.size + " bytes\n" +
                "========================================\n\n" +
                content +
                "\n\n"
            );
        } catch {
            skippedFiles.push(file.name);
        }
    }

    if (!includedFiles.length) {
        status.textContent =
            "No supported text files were found.";
        return;
    }

    const date = new Date();

    currentFilename =
        safeFilename(projectName) +
        "_Backup_" +
        date.toISOString().slice(0, 10) +
        ".txt";

    currentBundle =
        "MULTI BUNDLE — CODE BACKUP\n" +
        "Project: " + projectName + "\n" +
        "Created: " + date.toLocaleString() + "\n" +
        "Files included: " + includedFiles.length + "\n\n" +
        "NOTE: Binary assets such as images and fonts " +
        "are not included in this TXT file.\n\n" +
        includedFiles.join("\n") +
        "\n========== END OF BACKUP ==========\n";

    document.getElementById("preview").value = currentBundle;
    document.getElementById("previewArea").hidden = false;

    // Save a copy in this browser
    const backups = getBackups();

    const backup = {
        id: Date.now().toString() +
            Math.random().toString(36).slice(2, 7),

        project: projectName,
        filename: currentFilename,
        date: date.toISOString(),
        fileCount: includedFiles.length,
        content: currentBundle
    };

    backups.unshift(backup);

    try {
        saveBackups(backups.slice(0, 50));

        status.textContent =
            "Backup created and saved in this browser.";

    } catch {
        status.textContent =
            "Backup created, but browser storage is full. " +
            "Download the TXT file to keep it.";
    }

    if (skippedFiles.length) {
        status.textContent +=
            " Skipped: " + skippedFiles.join(", ");
    }

    renderAll();
}

// Download current backup
function downloadBundle() {
    if (!currentBundle) {
        return;
    }

    downloadText(currentFilename, currentBundle);
}

// Copy current backup
async function copyBundle() {
    if (!currentBundle) {
        return;
    }

    try {
        await navigator.clipboard.writeText(currentBundle);

        document.getElementById("status").textContent =
            "Backup copied to clipboard.";

    } catch {
        document.getElementById("status").textContent =
            "Copy unavailable. Select the preview text and copy it.";
    }
}

// Display one backup
function backupHTML(backup, showDelete = true) {
    return `
        <div class="backup-item">
            <div class="item-name">
                ${escapeHTML(backup.project)}
            </div>

            <div class="item-info">
                ${escapeHTML(backup.filename)}<br>
                ${backup.fileCount} file(s)<br>
                ${escapeHTML(new Date(backup.date).toLocaleString())}
            </div>

            <div class="item-actions">

                <button onclick="downloadSavedBackup('${backup.id}')">
                    Download
                </button>

                ${showDelete ? `
                    <button onclick="deleteBackup('${backup.id}')">
                        Delete
                    </button>
                ` : ""}

            </div>
        </div>
    `;
}

// Download a saved backup
function downloadSavedBackup(id) {
    const backup = getBackups().find(item => item.id === id);

    if (backup) {
        downloadText(backup.filename, backup.content);
    }
}

// Delete one backup
function deleteBackup(id) {
    if (!confirm("Delete this backup record?")) {
        return;
    }

    const backups = getBackups().filter(
        item => item.id !== id
    );

    saveBackups(backups);

    renderAll();
}

// Delete all saved backup records
function deleteAllBackups() {
    if (!confirm("Delete all saved backup records?")) {
        return;
    }

    localStorage.removeItem(STORAGE_KEY);

    renderAll();

    document.getElementById("status").textContent =
        "Saved backup records deleted.";
}

// Export backup information
function exportBackupList() {
    const backups = getBackups().map(
        ({ content, ...details }) => details
    );

    downloadText(
        "Multi_Bundle_Backup_List.json",
        JSON.stringify(backups, null, 2)
    );
}

// Refresh tabs and dashboard
function renderAll() {
    const backups = getBackups();

    const projects = [
        ...new Set(backups.map(backup => backup.project))
    ];

    document.getElementById("projectCount").textContent =
        projects.length;

    document.getElementById("backupCount").textContent =
        backups.length;

    // Recent backups
    const recent = document.getElementById("recentBackups");

    recent.innerHTML = backups.length
        ? backups.slice(0, 3)
            .map(backup => backupHTML(backup, false))
            .join("")
        : "No backups yet.";

    // All backups
    const backupList = document.getElementById("backupList");

    backupList.innerHTML = backups.length
        ? backups.map(backup => backupHTML(backup)).join("")
        : "No backups saved.";

    // Projects
    const projectList = document.getElementById("projectList");

    projectList.innerHTML = projects.length
        ? projects.map(project => {
            const count = backups.filter(
                backup => backup.project === project
            ).length;

            return `
                <div class="project-item">
                    <div class="item-name">
                        ${escapeHTML(project)}
                    </div>

                    <div class="item-info">
                        ${count} backup(s)
                    </div>
                </div>
            `;
        }).join("")
        : "No projects yet.";
}

// Initialize app
renderAll();
renderSelectedFiles();