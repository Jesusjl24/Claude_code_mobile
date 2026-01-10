// ============================================================================
// App State & Configuration
// ============================================================================
const API_BASE = '/api';
let currentUser = null;
let currentBook = null;
let searchTimeout = null;

// ============================================================================
// Initialize App
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Reading Journal App Initialized');

    // Initialize or get current user
    await initUser();

    // Load initial data
    if (currentUser) {
        await loadBooks();
    }

    // Setup event listeners
    setupEventListeners();
});

// ============================================================================
// User Management
// ============================================================================
async function initUser() {
    try {
        // Try to get users
        const users = await apiGet('/users');

        if (users.length > 0) {
            currentUser = users[0];
        } else {
            // Create demo user
            currentUser = await apiPost('/users', {
                username: 'demo_user',
                email: 'demo@readingjournal.com'
            });
        }

        console.log('Current user:', currentUser);
    } catch (error) {
        console.error('Error initializing user:', error);
        showNotification('Error initializing user', 'error');
    }
}

// ============================================================================
// Event Listeners
// ============================================================================
function setupEventListeners() {
    // Navigation
    document.getElementById('nav-library').addEventListener('click', () => {
        showView('library');
    });

    document.getElementById('nav-wrapped').addEventListener('click', async () => {
        showView('wrapped');
        await loadWrappedStats();
    });

    // Add Book Button
    document.getElementById('btn-add-book').addEventListener('click', () => {
        openAddBookModal();
    });

    // Book Search
    document.getElementById('book-search').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchBooks(e.target.value);
        }, 500);
    });

    // Manual Book Form
    document.getElementById('manual-book-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addBookManually();
    });

    // Library Search
    document.getElementById('search-library').addEventListener('input', (e) => {
        filterLibrary(e.target.value);
    });

    // Modal Close Buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeAllModals();
        });
    });

    // Close modal on overlay click
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') {
            closeAllModals();
        }
    });

    // Wrapped controls
    document.getElementById('wrapped-period').addEventListener('change', loadWrappedStats);
    document.getElementById('wrapped-year').addEventListener('change', loadWrappedStats);
}

// ============================================================================
// View Management
// ============================================================================
function showView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Show selected view
    document.getElementById(`${viewName}-view`).classList.add('active');

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`nav-${viewName}`).classList.add('active');
}

// ============================================================================
// Book Management
// ============================================================================
async function loadBooks() {
    try {
        showLoading(true);
        const books = await apiGet(`/books?user_id=${currentUser.id}`);

        const booksGrid = document.getElementById('books-grid');

        if (books.length === 0) {
            booksGrid.innerHTML = `
                <div class="empty-state">
                    <p>📖 No books yet. Start by adding your first book!</p>
                </div>
            `;
        } else {
            booksGrid.innerHTML = books.map(book => createBookCard(book)).join('');

            // Add click listeners
            document.querySelectorAll('.book-card').forEach(card => {
                card.addEventListener('click', () => {
                    openBookDetail(card.dataset.bookId);
                });
            });
        }
    } catch (error) {
        console.error('Error loading books:', error);
        showNotification('Error loading books', 'error');
    } finally {
        showLoading(false);
    }
}

function createBookCard(book) {
    const statusClass = `status-${book.status}`;
    const coverImage = book.cover_url
        ? `<img src="${book.cover_url}" alt="${book.title}">`
        : '📚';

    return `
        <div class="book-card" data-book-id="${book.id}">
            <div class="book-cover">
                ${coverImage}
            </div>
            <div class="book-info">
                <div class="book-title" title="${book.title}">${book.title}</div>
                <div class="book-author">${book.author}</div>
                <div class="book-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${book.progress_percentage}%"></div>
                    </div>
                    <div class="progress-text">
                        <span>${book.current_page} / ${book.total_pages} pages</span>
                        <span>${book.progress_percentage}%</span>
                    </div>
                </div>
                <span class="book-status ${statusClass}">${book.status}</span>
            </div>
        </div>
    `;
}

function filterLibrary(query) {
    const cards = document.querySelectorAll('.book-card');
    const searchLower = query.toLowerCase();

    cards.forEach(card => {
        const title = card.querySelector('.book-title').textContent.toLowerCase();
        const author = card.querySelector('.book-author').textContent.toLowerCase();

        if (title.includes(searchLower) || author.includes(searchLower)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

// ============================================================================
// Book Search (Open Library API)
// ============================================================================
async function searchBooks(query) {
    if (!query || query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }

    try {
        const books = await apiGet(`/books/search?q=${encodeURIComponent(query)}`);
        const resultsContainer = document.getElementById('search-results');

        if (books.length === 0) {
            resultsContainer.innerHTML = '<p class="empty-state">No books found</p>';
        } else {
            resultsContainer.innerHTML = books.map(book => `
                <div class="search-result-item" data-book='${JSON.stringify(book)}'>
                    <div class="search-result-cover">
                        ${book.cover_url ? `<img src="${book.cover_url}" alt="${book.title}">` : '📚'}
                    </div>
                    <div class="search-result-info">
                        <div class="search-result-title">${book.title}</div>
                        <div class="search-result-author">${book.author}</div>
                        <div class="search-result-pages">${book.total_pages || 'N/A'} pages</div>
                    </div>
                </div>
            `).join('');

            // Add click listeners
            document.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const bookData = JSON.parse(item.dataset.book);
                    addBookFromSearch(bookData);
                });
            });
        }
    } catch (error) {
        console.error('Error searching books:', error);
        showNotification('Error searching books', 'error');
    }
}

async function addBookFromSearch(bookData) {
    try {
        showLoading(true);
        const book = await apiPost('/books', {
            user_id: currentUser.id,
            title: bookData.title,
            author: bookData.author,
            cover_url: bookData.cover_url,
            total_pages: bookData.total_pages || 0,
            status: 'reading'
        });

        showNotification('Book added successfully!', 'success');
        closeAllModals();
        await loadBooks();
    } catch (error) {
        console.error('Error adding book:', error);
        showNotification('Error adding book', 'error');
    } finally {
        showLoading(false);
    }
}

async function addBookManually() {
    const title = document.getElementById('manual-title').value.trim();
    const author = document.getElementById('manual-author').value.trim();
    const pages = document.getElementById('manual-pages').value || 0;

    if (!title || !author) {
        showNotification('Title and author are required', 'error');
        return;
    }

    try {
        showLoading(true);
        await apiPost('/books', {
            user_id: currentUser.id,
            title,
            author,
            total_pages: parseInt(pages),
            status: 'reading'
        });

        showNotification('Book added successfully!', 'success');
        document.getElementById('manual-book-form').reset();
        closeAllModals();
        await loadBooks();
    } catch (error) {
        console.error('Error adding book:', error);
        showNotification('Error adding book', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// Book Detail View
// ============================================================================
async function openBookDetail(bookId) {
    try {
        showLoading(true);
        const book = await apiGet(`/books/${bookId}`);
        const sessions = await apiGet(`/books/${bookId}/sessions`);
        const photos = await apiGet(`/books/${bookId}/photos`);

        currentBook = book;

        const coverImage = book.cover_url
            ? `<img src="${book.cover_url}" alt="${book.title}" class="book-detail-cover">`
            : `<div class="book-detail-cover" style="display: flex; align-items: center; justify-content: center; font-size: 4rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">📚</div>`;

        document.getElementById('detail-title').textContent = book.title;
        document.getElementById('book-detail-content').innerHTML = `
            <div class="book-detail-header">
                ${coverImage}
                <div class="book-detail-info">
                    <h3>${book.author}</h3>
                    <div class="book-detail-meta">
                        <div class="meta-item">
                            <span class="meta-label">Status</span>
                            <span class="meta-value status-${book.status}">${book.status}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Progress</span>
                            <span class="meta-value">${book.current_page} / ${book.total_pages} pages (${book.progress_percentage}%)</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Remaining</span>
                            <span class="meta-value">${book.pages_remaining} pages</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Photos</span>
                            <span class="meta-value">${book.photo_count} / 20</span>
                        </div>
                    </div>
                    <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn btn-primary" onclick="showLogSessionForm()">📖 Log Reading</button>
                        <button class="btn btn-secondary" onclick="showUploadPhotoForm()">📸 Add Photo</button>
                        <button class="btn btn-danger" onclick="deleteCurrentBook()">🗑️ Delete</button>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Reading Sessions <span style="font-size: 0.9rem; color: var(--text-light);">(${sessions.length})</span></h3>
                <div id="sessions-container" class="session-list">
                    ${sessions.length > 0 ? sessions.map(session => `
                        <div class="session-item">
                            <div>
                                <div class="session-date">${formatDate(session.date)}</div>
                                ${session.notes ? `<div style="color: var(--text-light); font-size: 0.9rem;">${session.notes}</div>` : ''}
                            </div>
                            <div class="session-pages">+${session.pages_read} pages</div>
                        </div>
                    `).join('') : '<p class="empty-state">No reading sessions yet</p>'}
                </div>
            </div>

            <div class="detail-section">
                <h3>Photo Gallery <span style="font-size: 0.9rem; color: var(--text-light);">(${photos.length} / 20)</span></h3>
                <div id="photos-container" class="photo-gallery">
                    ${photos.length > 0 ? photos.map(photo => `
                        <div class="photo-item">
                            <img src="/static/uploads/${photo.image_path}" alt="Book photo" onclick="viewPhoto('/static/uploads/${photo.image_path}')">
                            <button class="photo-delete" onclick="deletePhoto(${photo.id}, event)">×</button>
                        </div>
                    `).join('') : '<p class="empty-state">No photos yet</p>'}
                </div>
            </div>
        `;

        openModal('modal-book-detail');
    } catch (error) {
        console.error('Error loading book detail:', error);
        showNotification('Error loading book details', 'error');
    } finally {
        showLoading(false);
    }
}

function showLogSessionForm() {
    const content = document.getElementById('book-detail-content');
    const formHtml = `
        <div style="background: var(--bg-color); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
            <h3 style="margin-bottom: 1rem;">Log Reading Session</h3>
            <form id="log-session-form" onsubmit="logReadingSession(event)">
                <input type="number" id="session-pages" placeholder="Pages read" required min="1">
                <input type="date" id="session-date" value="${new Date().toISOString().split('T')[0]}" required>
                <textarea id="session-notes" placeholder="Notes (optional)"></textarea>
                <div style="display: flex; gap: 0.5rem;">
                    <button type="submit" class="btn btn-success">Save Session</button>
                    <button type="button" class="btn btn-secondary" onclick="openBookDetail(${currentBook.id})">Cancel</button>
                </div>
            </form>
        </div>
    `;
    content.insertAdjacentHTML('afterbegin', formHtml);
    document.getElementById('session-pages').focus();
}

async function logReadingSession(event) {
    event.preventDefault();

    const pages = parseInt(document.getElementById('session-pages').value);
    const date = document.getElementById('session-date').value;
    const notes = document.getElementById('session-notes').value.trim();

    try {
        showLoading(true);
        await apiPost('/sessions', {
            book_id: currentBook.id,
            pages_read: pages,
            date: date,
            notes: notes || null
        });

        showNotification('Reading session logged!', 'success');
        await openBookDetail(currentBook.id);
        await loadBooks();
    } catch (error) {
        console.error('Error logging session:', error);
        showNotification('Error logging session', 'error');
    } finally {
        showLoading(false);
    }
}

function showUploadPhotoForm() {
    const content = document.getElementById('book-detail-content');
    const formHtml = `
        <div style="background: var(--bg-color); padding: 1.5rem; border-radius: 12px; margin-bottom: 1rem;">
            <h3 style="margin-bottom: 1rem;">Upload Photo</h3>
            <form id="upload-photo-form" onsubmit="uploadPhoto(event)">
                <input type="file" id="photo-file" accept="image/*" required style="margin-bottom: 1rem;">
                <input type="text" id="photo-caption" placeholder="Caption (optional)">
                <div style="display: flex; gap: 0.5rem;">
                    <button type="submit" class="btn btn-success">Upload Photo</button>
                    <button type="button" class="btn btn-secondary" onclick="openBookDetail(${currentBook.id})">Cancel</button>
                </div>
            </form>
        </div>
    `;
    content.insertAdjacentHTML('afterbegin', formHtml);
}

async function uploadPhoto(event) {
    event.preventDefault();

    const fileInput = document.getElementById('photo-file');
    const caption = document.getElementById('photo-caption').value.trim();

    if (!fileInput.files[0]) {
        showNotification('Please select a photo', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('photo', fileInput.files[0]);
    if (caption) {
        formData.append('caption', caption);
    }

    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/books/${currentBook.id}/photos`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        showNotification('Photo uploaded!', 'success');
        await openBookDetail(currentBook.id);
    } catch (error) {
        console.error('Error uploading photo:', error);
        showNotification(error.message || 'Error uploading photo', 'error');
    } finally {
        showLoading(false);
    }
}

async function deletePhoto(photoId, event) {
    event.stopPropagation();

    if (!confirm('Delete this photo?')) {
        return;
    }

    try {
        showLoading(true);
        await apiDelete(`/photos/${photoId}`);
        showNotification('Photo deleted', 'success');
        await openBookDetail(currentBook.id);
    } catch (error) {
        console.error('Error deleting photo:', error);
        showNotification('Error deleting photo', 'error');
    } finally {
        showLoading(false);
    }
}

function viewPhoto(photoUrl) {
    window.open(photoUrl, '_blank');
}

async function deleteCurrentBook() {
    if (!confirm(`Delete "${currentBook.title}"? This will remove all sessions and photos.`)) {
        return;
    }

    try {
        showLoading(true);
        await apiDelete(`/books/${currentBook.id}`);
        showNotification('Book deleted', 'success');
        closeAllModals();
        await loadBooks();
    } catch (error) {
        console.error('Error deleting book:', error);
        showNotification('Error deleting book', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// Reading Wrapped Stats
// ============================================================================
async function loadWrappedStats() {
    if (!currentUser) return;

    try {
        showLoading(true);
        const period = document.getElementById('wrapped-period').value;
        const year = document.getElementById('wrapped-year').value;

        const stats = await apiGet(`/stats/wrapped?user_id=${currentUser.id}&period=${period}&year=${year}`);

        document.getElementById('wrapped-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">📚</div>
                <div class="stat-value">${stats.books_added}</div>
                <div class="stat-label">Books Added</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-value">${stats.books_completed}</div>
                <div class="stat-label">Books Completed</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📖</div>
                <div class="stat-value">${stats.pages_read.toLocaleString()}</div>
                <div class="stat-label">Pages Read</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📸</div>
                <div class="stat-value">${stats.photos_captured}</div>
                <div class="stat-label">Photos Captured</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🔥</div>
                <div class="stat-value">${stats.reading_streak}</div>
                <div class="stat-label">Day Streak</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <div class="stat-value">${stats.avg_pages_per_day}</div>
                <div class="stat-label">Avg Pages/Day</div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
        showNotification('Error loading statistics', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// Modal Management
// ============================================================================
function openAddBookModal() {
    document.getElementById('book-search').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('manual-book-form').reset();
    openModal('modal-add-book');
}

function openModal(modalId) {
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById(modalId).style.display = 'block';
}

function closeAllModals() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    currentBook = null;
}

// ============================================================================
// API Helper Functions
// ============================================================================
async function apiGet(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
}

async function apiPost(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API Error');
    }
    return response.json();
}

async function apiPut(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
}

async function apiDelete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }
}

// ============================================================================
// Utility Functions
// ============================================================================
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = 'info') {
    // Simple alert for now - could be enhanced with toast notifications
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Create toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : 'var(--primary-color)'};
        color: white;
        border-radius: 8px;
        box-shadow: var(--shadow-hover);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
