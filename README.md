# Movie Recommendation System

This is a feature-rich movie recommendation web application built with modern technologies. It provides personalized movie recommendations, user authentication, and an administrative interface for managing the platform. The system leverages the TMDB API for movie data and Google Generative AI for intelligent recommendations.

## Key Features

-   **User Authentication:** Secure sign-in with Google (OAuth) using NextAuth.js.
-   **Movie & TV Show Discovery:** Browse trending, top-rated, and popular movies and TV shows.
-   **AI-Powered Recommendations:** Get personalized movie suggestions based on your viewing history and preferences, powered by Google Generative AI.
-   **AI Assistant:** A chat interface to interact with an AI for movie-related queries.
-   **Search:** Find movies, TV shows, and actors.
-   **Personalization:**
    -   **Watchlist:** Save movies and TV shows to watch later.
    -   **Favorites:** Mark your favorite content.
    -   **History:** Tracks your viewing history.
-   **Genre-based Browsing:** Discover content by genre.
-   **Admin Dashboard:**
    -   User management (view, promote users to admin).
    -   Cache management for Redis.
    -   View system statistics.
-   **Responsive Design:** A modern, responsive UI built with Tailwind CSS and Shadcn/ui.
-   **Caching:** Uses Redis for caching API responses to improve performance.

## Tech Stack

-   **Framework:** [Next.js](https://nextjs.org/) (with App Router)
-   **Language:** [TypeScript](https://www.typescriptlang.org/)
-   **Authentication:** [NextAuth.js](https://next-auth.js.org/)
-   **Database:** [MongoDB](https://www.mongodb.com/)
-   **ORM/ODM:** [Prisma](https://www.prisma.io/) & [Mongoose](https://mongoosejs.com/)
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/), [Shadcn/ui](https://ui.shadcn.com/)
-   **Caching:** [Redis](https://redis.io/) (with `ioredis`)
-   **AI:** [Google Generative AI](https://ai.google/)
-   **Form Management:** [React Hook Form](https://react-hook-form.com/) & [Zod](https://zod.dev/)
-   **UI Components:** [Recharts](https://recharts.org/), [Embla Carousel](https://www.embla-carousel.com/), [Sonner](https://sonner.emilkowal.ski/) (for toasts)

## Getting Started

Follow these instructions to get the project up and running on your local machine.

### Prerequisites

-   [Node.js](https://nodejs.org/) (v20.x or later)
-   [npm](https://www.npmjs.com/)
-   [MongoDB](https://www.mongodb.com/try/download/community) instance (local or cloud)
-   [Redis](https://redis.io/docs/getting-started/installation/) instance (local or cloud)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/movie-recommendation-system.git
cd movie-recommendation-system
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root of your project and add the following variables.

```env
# TMDB API Key (https://www.themoviedb.org/settings/api)
TMDB_API_KEY=your_tmdb_api_key

# MongoDB Connection String
MONGODB_URI=your_mongodb_connection_string

# Google OAuth Credentials (https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# NextAuth Secret
# Generate one here: https://generate-secret.vercel.app/32
NEXTAUTH_SECRET=your_nextauth_secret

# Google Generative AI API Key (https://aistudio.google.com/app/apikey)
GOOGLE_API_KEY=your_google_ai_api_key

# Redis Connection URL
# Example: redis://localhost:6379
REDIS_URL=your_redis_url

# Your app's base URL
NEXTAUTH_URL=http://localhost:3000
```

### 4. Setup the Database

Run the following script to set up the necessary database collections and data.

```bash
npm run setup-db
```

### 5. Run the Application

Now, start the development server:

```bash
npm run dev
```

The application should now be running at [http://localhost:3000](http://localhost:3000).

---

 
