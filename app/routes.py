from flask import Blueprint, render_template, jsonify, request, current_app, send_from_directory
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
from sqlalchemy import func, extract
import requests
import os
from pathlib import Path

from app import db
from app.models import User, Book, ReadingSession, Photo

# Blueprints
main_bp = Blueprint('main', __name__)
api_bp = Blueprint('api', __name__)


# ============================================================================
# MAIN ROUTES (HTML Pages)
# ============================================================================

@main_bp.route('/')
def index():
    """Main app page"""
    return render_template('index.html')


@main_bp.route('/manifest.json')
def manifest():
    """PWA manifest"""
    return send_from_directory('static', 'manifest.json')


@main_bp.route('/sw.js')
def service_worker():
    """Service worker for PWA"""
    return send_from_directory('static/js', 'sw.js')


# ============================================================================
# API ROUTES
# ============================================================================

# User Routes
@api_bp.route('/users', methods=['GET'])
def get_users():
    """Get all users"""
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])


@api_bp.route('/users', methods=['POST'])
def create_user():
    """Create a new user"""
    data = request.get_json()

    if not data or 'username' not in data or 'email' not in data:
        return jsonify({'error': 'Username and email are required'}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 409

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 409

    user = User(username=data['username'], email=data['email'])
    db.session.add(user)
    db.session.commit()

    return jsonify(user.to_dict()), 201


# Book Routes
@api_bp.route('/books', methods=['GET'])
def get_books():
    """Get all books for a user"""
    user_id = request.args.get('user_id', type=int)

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    books = Book.query.filter_by(user_id=user_id).order_by(Book.date_added.desc()).all()
    return jsonify([book.to_dict() for book in books])


@api_bp.route('/books/<int:book_id>', methods=['GET'])
def get_book(book_id):
    """Get a specific book"""
    book = Book.query.get_or_404(book_id)
    return jsonify(book.to_dict())


@api_bp.route('/books', methods=['POST'])
def create_book():
    """Create a new book"""
    data = request.get_json()

    required_fields = ['user_id', 'title', 'author']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'user_id, title, and author are required'}), 400

    book = Book(
        user_id=data['user_id'],
        title=data['title'],
        author=data['author'],
        cover_url=data.get('cover_url'),
        total_pages=data.get('total_pages', 0),
        current_page=data.get('current_page', 0),
        status=data.get('status', 'reading')
    )

    db.session.add(book)
    db.session.commit()

    return jsonify(book.to_dict()), 201


@api_bp.route('/books/<int:book_id>', methods=['PUT'])
def update_book(book_id):
    """Update a book"""
    book = Book.query.get_or_404(book_id)
    data = request.get_json()

    updatable_fields = ['title', 'author', 'cover_url', 'total_pages', 'current_page', 'status']
    for field in updatable_fields:
        if field in data:
            setattr(book, field, data[field])

    db.session.commit()
    return jsonify(book.to_dict())


@api_bp.route('/books/<int:book_id>', methods=['DELETE'])
def delete_book(book_id):
    """Delete a book"""
    book = Book.query.get_or_404(book_id)

    # Delete associated photos from filesystem
    for photo in book.photos:
        try:
            photo_path = Path(current_app.config['UPLOAD_FOLDER']) / photo.image_path
            if photo_path.exists():
                photo_path.unlink()
        except Exception as e:
            current_app.logger.error(f"Error deleting photo: {e}")

    db.session.delete(book)
    db.session.commit()

    return '', 204


# Search Open Library API
@api_bp.route('/books/search', methods=['GET'])
def search_books():
    """Search for books using Open Library API"""
    query = request.args.get('q')

    if not query:
        return jsonify({'error': 'Query parameter q is required'}), 400

    try:
        response = requests.get(
            f"{current_app.config['OPEN_LIBRARY_API']}/search.json",
            params={'q': query, 'limit': 10},
            timeout=5
        )
        response.raise_for_status()
        data = response.json()

        books = []
        for doc in data.get('docs', []):
            book_data = {
                'title': doc.get('title'),
                'author': ', '.join(doc.get('author_name', ['Unknown'])),
                'cover_url': None,
                'total_pages': doc.get('number_of_pages_median', 0),
                'isbn': doc.get('isbn', [None])[0] if doc.get('isbn') else None
            }

            # Get cover image
            if doc.get('cover_i'):
                book_data['cover_url'] = f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg"

            books.append(book_data)

        return jsonify(books)

    except requests.RequestException as e:
        return jsonify({'error': f'Failed to fetch from Open Library: {str(e)}'}), 500


# Reading Session Routes
@api_bp.route('/sessions', methods=['POST'])
def create_session():
    """Create a new reading session"""
    data = request.get_json()

    if not data or 'book_id' not in data or 'pages_read' not in data:
        return jsonify({'error': 'book_id and pages_read are required'}), 400

    book = Book.query.get_or_404(data['book_id'])

    # Create session
    session_date = datetime.fromisoformat(data['date']) if 'date' in data else datetime.utcnow()
    session = ReadingSession(
        book_id=data['book_id'],
        pages_read=data['pages_read'],
        date=session_date.date(),
        notes=data.get('notes')
    )

    # Update book progress
    book.current_page = min(book.current_page + data['pages_read'], book.total_pages)

    # Auto-complete if finished
    if book.current_page >= book.total_pages and book.total_pages > 0:
        book.status = 'completed'

    db.session.add(session)
    db.session.commit()

    return jsonify(session.to_dict()), 201


@api_bp.route('/books/<int:book_id>/sessions', methods=['GET'])
def get_book_sessions(book_id):
    """Get all reading sessions for a book"""
    Book.query.get_or_404(book_id)  # Verify book exists
    sessions = ReadingSession.query.filter_by(book_id=book_id).order_by(ReadingSession.date.desc()).all()
    return jsonify([session.to_dict() for session in sessions])


# Photo Routes
@api_bp.route('/books/<int:book_id>/photos', methods=['GET'])
def get_book_photos(book_id):
    """Get all photos for a book"""
    Book.query.get_or_404(book_id)  # Verify book exists
    photos = Photo.query.filter_by(book_id=book_id).order_by(Photo.uploaded_at.desc()).all()
    return jsonify([photo.to_dict() for photo in photos])


@api_bp.route('/books/<int:book_id>/photos', methods=['POST'])
def upload_photo(book_id):
    """Upload a photo for a book"""
    book = Book.query.get_or_404(book_id)

    # Check photo limit
    if len(book.photos) >= current_app.config['MAX_PHOTOS_PER_BOOK']:
        return jsonify({'error': f"Maximum {current_app.config['MAX_PHOTOS_PER_BOOK']} photos per book"}), 400

    if 'photo' not in request.files:
        return jsonify({'error': 'No photo file provided'}), 400

    file = request.files['photo']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if file and allowed_file(file.filename):
        # Generate unique filename
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = secure_filename(f"{book_id}_{timestamp}_{file.filename}")
        filepath = Path(current_app.config['UPLOAD_FOLDER']) / filename

        # Save file
        file.save(filepath)

        # Create photo record
        photo = Photo(
            book_id=book_id,
            image_path=filename,
            caption=request.form.get('caption')
        )

        db.session.add(photo)
        db.session.commit()

        return jsonify(photo.to_dict()), 201

    return jsonify({'error': 'Invalid file type'}), 400


@api_bp.route('/photos/<int:photo_id>', methods=['DELETE'])
def delete_photo(photo_id):
    """Delete a photo"""
    photo = Photo.query.get_or_404(photo_id)

    # Delete file
    try:
        photo_path = Path(current_app.config['UPLOAD_FOLDER']) / photo.image_path
        if photo_path.exists():
            photo_path.unlink()
    except Exception as e:
        current_app.logger.error(f"Error deleting photo file: {e}")

    db.session.delete(photo)
    db.session.commit()

    return '', 204


# Reading Wrapped (Statistics)
@api_bp.route('/stats/wrapped', methods=['GET'])
def get_wrapped_stats():
    """Get reading statistics for wrapped feature"""
    user_id = request.args.get('user_id', type=int)
    period = request.args.get('period', 'yearly')  # monthly, quarterly, yearly
    year = request.args.get('year', type=int, default=datetime.utcnow().year)

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    # Date range based on period
    if period == 'monthly':
        month = request.args.get('month', type=int, default=datetime.utcnow().month)
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
    elif period == 'quarterly':
        quarter = request.args.get('quarter', type=int, default=((datetime.utcnow().month - 1) // 3) + 1)
        start_month = (quarter - 1) * 3 + 1
        start_date = datetime(year, start_month, 1)
        end_month = start_month + 3
        if end_month > 12:
            end_date = datetime(year + 1, end_month - 12, 1)
        else:
            end_date = datetime(year, end_month, 1)
    else:  # yearly
        start_date = datetime(year, 1, 1)
        end_date = datetime(year + 1, 1, 1)

    # Get books in period
    books = Book.query.filter(
        Book.user_id == user_id,
        Book.date_added >= start_date,
        Book.date_added < end_date
    ).all()

    # Books completed
    books_completed = Book.query.filter(
        Book.user_id == user_id,
        Book.status == 'completed',
        Book.date_added >= start_date,
        Book.date_added < end_date
    ).count()

    # Total pages read
    pages_read = db.session.query(func.sum(ReadingSession.pages_read)).join(Book).filter(
        Book.user_id == user_id,
        ReadingSession.date >= start_date.date(),
        ReadingSession.date < end_date.date()
    ).scalar() or 0

    # Photos captured
    photos_captured = db.session.query(func.count(Photo.id)).join(Book).filter(
        Book.user_id == user_id,
        Photo.uploaded_at >= start_date,
        Photo.uploaded_at < end_date
    ).scalar() or 0

    # Reading streak
    streak = calculate_reading_streak(user_id)

    stats = {
        'period': period,
        'year': year,
        'books_added': len(books),
        'books_completed': books_completed,
        'pages_read': pages_read,
        'photos_captured': photos_captured,
        'reading_streak': streak,
        'avg_pages_per_day': round(pages_read / ((end_date - start_date).days or 1), 1)
    }

    return jsonify(stats)


# Helper functions
def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in current_app.config['ALLOWED_EXTENSIONS']


def calculate_reading_streak(user_id):
    """Calculate current reading streak in days"""
    today = datetime.utcnow().date()

    # Get all unique reading dates
    reading_dates = db.session.query(ReadingSession.date).join(Book).filter(
        Book.user_id == user_id
    ).distinct().order_by(ReadingSession.date.desc()).all()

    if not reading_dates:
        return 0

    reading_dates = [d[0] for d in reading_dates]

    # Check if there's a read today or yesterday
    if reading_dates[0] != today and reading_dates[0] != today - timedelta(days=1):
        return 0

    # Count consecutive days
    streak = 1
    for i in range(len(reading_dates) - 1):
        diff = (reading_dates[i] - reading_dates[i + 1]).days
        if diff == 1:
            streak += 1
        else:
            break

    return streak
