#!/usr/bin/env python3
"""
Demo script to show the Reading Journal app features
"""
from app import create_app, db
from app.models import User, Book, ReadingSession, Photo
from datetime import datetime, timedelta

def create_demo_data():
    """Create some demo data for testing"""
    app = create_app()

    with app.app_context():
        # Check if demo user already exists
        user = User.query.filter_by(username='demo_user').first()

        if user:
            print(f"✓ Demo user already exists: {user.username}")
            print(f"  - Email: {user.email}")
            print(f"  - Books: {len(user.books)}")
            return

        # Create demo user
        user = User(
            username='demo_user',
            email='demo@readingjournal.com'
        )
        db.session.add(user)
        db.session.commit()
        print(f"✓ Created demo user: {user.username}")

        # Add sample books
        books = [
            {
                'title': 'The Great Gatsby',
                'author': 'F. Scott Fitzgerald',
                'total_pages': 180,
                'current_page': 45,
                'status': 'reading'
            },
            {
                'title': '1984',
                'author': 'George Orwell',
                'total_pages': 328,
                'current_page': 328,
                'status': 'completed'
            },
            {
                'title': 'To Kill a Mockingbird',
                'author': 'Harper Lee',
                'total_pages': 324,
                'current_page': 0,
                'status': 'reading'
            }
        ]

        for book_data in books:
            book = Book(
                user_id=user.id,
                **book_data
            )
            db.session.add(book)
            db.session.commit()
            print(f"✓ Added book: {book.title}")

            # Add reading sessions for completed and in-progress books
            if book.status == 'completed' or book.current_page > 0:
                # Add a few sessions
                for i in range(3):
                    session = ReadingSession(
                        book_id=book.id,
                        pages_read=15 + i * 5,
                        date=(datetime.now() - timedelta(days=i+1)).date()
                    )
                    db.session.add(session)
                db.session.commit()
                print(f"  - Added {3} reading sessions")

        print("\n✓ Demo data created successfully!")
        print("\nYou can now start the app and explore the features.")
        print("Run: python app.py")

if __name__ == '__main__':
    create_demo_data()
