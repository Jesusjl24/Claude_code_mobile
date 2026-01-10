# Quick Start Guide - Reading Journal PWA

## 🚀 Running the App on Your iPad Pro

### Option 1: Local Development (Recommended for Testing)

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the app:**
   ```bash
   python app.py
   ```

3. **Access the app:**
   - Open your browser and go to: `http://localhost:5000`
   - Or from your iPad on the same network: `http://[your-computer-ip]:5000`

### Option 2: Deploy to a Cloud Platform

Deploy to platforms like:
- **Heroku** (Free tier available)
- **PythonAnywhere** (Free tier available)
- **Railway** (Free tier available)
- **Vercel** (with Python support)

## 📱 Installing as PWA on iPad

Once the app is running:

1. **Open in Safari** (not Chrome - Safari has better PWA support on iOS)
2. Tap the **Share button** (square with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Give it a name (e.g., "Reading Journal")
5. Tap **"Add"**

The app will now appear on your home screen like a native app!

## ✨ Features to Try

### 1. Add Your First Book
- Tap **"+ Add Book"**
- Search for a book using the Open Library search
- Or add manually with title, author, and page count

### 2. Track Your Reading Progress
- Tap on any book card
- Click **"📖 Log Reading"**
- Enter pages read and date
- Watch your progress bar update!

### 3. Capture Book Moments
- Open a book detail view
- Click **"📸 Add Photo"**
- Upload a photo of a favorite page or quote
- Up to 20 photos per book!

### 4. View Your Reading Wrapped
- Tap the **"Wrapped"** tab
- Select period (monthly/quarterly/yearly)
- See your stats:
  - Books completed
  - Pages read
  - Photos captured
  - Reading streak 🔥

## 🎨 Demo Data

Run the demo script to populate with sample books:
```bash
python demo.py
```

This creates:
- Demo user account
- 3 sample books (The Great Gatsby, 1984, To Kill a Mockingbird)
- Reading sessions with progress tracking

## 🔧 Troubleshooting

**Can't access from iPad?**
- Make sure your iPad and computer are on the same WiFi network
- Find your computer's IP address:
  - Mac: System Preferences → Network
  - Windows: `ipconfig` in Command Prompt
  - Linux: `ip addr` or `hostname -I`

**Port already in use?**
- Change the port in `app.py`:
  ```python
  app.run(debug=True, host='0.0.0.0', port=5001)
  ```

**PWA not installing?**
- Must use Safari on iOS (Chrome doesn't support PWA installation)
- App must be served over HTTPS for full PWA features (local testing is OK with HTTP)

## 📖 API Testing

You can test the API directly:

```bash
# Get all books
curl http://localhost:5000/api/books?user_id=1

# Search for books
curl http://localhost:5000/api/books/search?q=gatsby

# Get reading stats
curl http://localhost:5000/api/stats/wrapped?user_id=1&period=yearly&year=2026
```

## 🎯 Next Steps

1. Customize the app colors in `app/static/css/style.css`
2. Replace placeholder icons in `app/static/icons/` with custom designs
3. Deploy to a hosting platform for remote access
4. Add more features like:
   - Book ratings
   - Reading goals
   - Social sharing
   - Book recommendations

## 💡 Tips for iPad Pro

- **Portrait Mode**: Optimized for single-handed reading tracking
- **Landscape Mode**: Great for viewing photo galleries side-by-side
- **Dark Mode**: Automatically adapts to your system preference
- **Offline Mode**: Service worker caches data for offline access

Enjoy tracking your reading journey! 📚✨
