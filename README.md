# 📚 Reading Journal PWA

A mobile-first Progressive Web App (PWA) for tracking your reading journey. Log books, track progress, capture page photos, and view personalized reading statistics.

## Features

### Core Functionality
- **📖 Book Management**: Add books by searching Open Library API or manual entry
- **📊 Progress Tracking**: Log reading sessions with pages read and dates
- **📸 Photo Gallery**: Upload up to 20 high-quality page photos per book
- **🎁 Reading Wrapped**: View monthly, quarterly, and yearly reading statistics

### Reading Stats Include
- Books added and completed
- Total pages read
- Photos captured
- Current reading streak
- Average pages per day

## Tech Stack

- **Backend**: Python Flask 3.0
- **Database**: SQLite with SQLAlchemy ORM
- **Frontend**: Vanilla JavaScript (mobile-first, responsive)
- **PWA**: Service Worker for offline capability
- **Storage**: Local filesystem for photos
- **API**: Open Library API for book metadata

## Database Schema

### Users
- id (Primary Key)
- username (Unique)
- email (Unique)
- created_at

### Books
- id (Primary Key)
- user_id (Foreign Key → Users)
- title
- author
- cover_url
- total_pages
- current_page
- status (reading/completed/paused)
- date_added

### ReadingSessions
- id (Primary Key)
- book_id (Foreign Key → Books)
- pages_read
- date
- notes
- created_at

### Photos
- id (Primary Key)
- book_id (Foreign Key → Books)
- image_path
- caption
- uploaded_at

## Installation

### Prerequisites
- Python 3.8+
- pip

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd Claude_code_mobile
```

2. **Create virtual environment**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Run the application**
```bash
python app.py
```

The app will be available at `http://localhost:5000`

## API Endpoints

### Users
- `GET /api/users` - Get all users
- `POST /api/users` - Create a new user

### Books
- `GET /api/books?user_id=<id>` - Get all books for a user
- `GET /api/books/<book_id>` - Get specific book
- `POST /api/books` - Create a new book
- `PUT /api/books/<book_id>` - Update a book
- `DELETE /api/books/<book_id>` - Delete a book
- `GET /api/books/search?q=<query>` - Search Open Library API

### Reading Sessions
- `POST /api/sessions` - Create a reading session
- `GET /api/books/<book_id>/sessions` - Get all sessions for a book

### Photos
- `GET /api/books/<book_id>/photos` - Get all photos for a book
- `POST /api/books/<book_id>/photos` - Upload a photo
- `DELETE /api/photos/<photo_id>` - Delete a photo

### Statistics
- `GET /api/stats/wrapped?user_id=<id>&period=<period>&year=<year>` - Get reading stats
  - Periods: `monthly`, `quarterly`, `yearly`

## Project Structure

```
Claude_code_mobile/
├── app/
│   ├── __init__.py           # Flask app factory
│   ├── config.py             # Configuration settings
│   ├── models.py             # SQLAlchemy database models
│   ├── routes.py             # API routes and blueprints
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css     # (To be created)
│   │   ├── js/
│   │   │   ├── app.js        # (To be created)
│   │   │   └── sw.js         # Service worker
│   │   ├── uploads/          # Photo storage
│   │   └── manifest.json     # PWA manifest
│   └── templates/
│       └── index.html        # Main app template
├── app.py                    # Application entry point
├── requirements.txt          # Python dependencies
├── .gitignore
└── README.md
```

## Configuration

Configuration is managed in `app/config.py`. Key settings:

- `SECRET_KEY`: Flask secret key (set via environment variable in production)
- `SQLALCHEMY_DATABASE_URI`: Database connection string
- `UPLOAD_FOLDER`: Photo storage location
- `MAX_PHOTOS_PER_BOOK`: Maximum photos per book (default: 20)
- `MAX_CONTENT_LENGTH`: Maximum upload size (default: 16MB)

## Development

### Database
The database is automatically created on first run. The SQLite database file is `reading_journal.db` in the project root.

### Adding New Features
1. Update models in `app/models.py` if schema changes are needed
2. Add API endpoints in `app/routes.py`
3. Update frontend in `app/templates/` and `app/static/`

### Testing the PWA
1. Serve over HTTPS (required for PWA features)
2. Open Chrome DevTools → Application → Service Workers
3. Test offline functionality by enabling "Offline" mode

## Next Steps

To complete the frontend implementation:

1. **Create `app/static/css/style.css`** - Mobile-first responsive styles
2. **Create `app/static/js/app.js`** - JavaScript for API calls and UI interactions
3. **Add PWA icons** - Create 192x192 and 512x512 PNG icons in `app/static/icons/`
4. **Implement frontend features**:
   - Book search and add functionality
   - Book detail view with progress tracking
   - Photo upload and gallery
   - Reading session logging
   - Wrapped statistics visualization

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.