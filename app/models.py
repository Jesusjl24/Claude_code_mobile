from datetime import datetime
from app import db


class User(db.Model):
    """User model for authentication and book ownership"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    books = db.relationship('Book', backref='owner', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }


class Book(db.Model):
    """Book model for tracking reading progress"""
    __tablename__ = 'books'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    author = db.Column(db.String(200), nullable=False)
    cover_url = db.Column(db.String(500))
    total_pages = db.Column(db.Integer, default=0)
    current_page = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='reading')  # reading, completed, paused
    date_added = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)

    # Relationships
    reading_sessions = db.relationship('ReadingSession', backref='book', lazy=True,
                                      cascade='all, delete-orphan', order_by='ReadingSession.date.desc()')
    photos = db.relationship('Photo', backref='book', lazy=True,
                           cascade='all, delete-orphan', order_by='Photo.uploaded_at.desc()')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'author': self.author,
            'cover_url': self.cover_url,
            'total_pages': self.total_pages,
            'current_page': self.current_page,
            'status': self.status,
            'date_added': self.date_added.isoformat(),
            'pages_remaining': max(0, self.total_pages - self.current_page),
            'progress_percentage': round((self.current_page / self.total_pages * 100), 1) if self.total_pages > 0 else 0,
            'photo_count': len(self.photos),
            'session_count': len(self.reading_sessions)
        }


class ReadingSession(db.Model):
    """Reading session model for tracking daily reading progress"""
    __tablename__ = 'reading_sessions'

    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id'), nullable=False, index=True)
    pages_read = db.Column(db.Integer, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow, index=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'book_id': self.book_id,
            'pages_read': self.pages_read,
            'date': self.date.isoformat(),
            'notes': self.notes,
            'created_at': self.created_at.isoformat()
        }


class Photo(db.Model):
    """Photo model for storing book page images"""
    __tablename__ = 'photos'

    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey('books.id'), nullable=False, index=True)
    image_path = db.Column(db.String(500), nullable=False)
    caption = db.Column(db.String(500))
    uploaded_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'book_id': self.book_id,
            'image_path': self.image_path,
            'caption': self.caption,
            'uploaded_at': self.uploaded_at.isoformat()
        }
