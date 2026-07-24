# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Authentication Setup (Supabase & Google OAuth)

To make Google Login work with the native Supabase auth client, you must configure the Google Provider in your Supabase Dashboard:

1. **Get Google OAuth Credentials**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a project or use an existing one.
   - Navigate to **APIs & Services** > **Credentials**.
   - Create an **OAuth 2.0 Client ID** (select *Web application*).
   - Set the Authorized JavaScript origins to: `http://localhost:8080` (and production domain if applicable).

2. **Configure Supabase**:
   - Go to your [Supabase Dashboard](https://supabase.com/dashboard) and select your project (`sypqoqzwgacexsnutltw`).
   - Navigate to **Authentication** > **Providers** > **Google**.
   - Turn on the Google provider.
   - Paste your **Client ID** and **Client Secret** (from the Google Cloud Console credentials page).
   - Copy the **Redirect URL** (Callback URL) shown in the Supabase Google Provider dashboard.
   - Save the settings in Supabase.

3. **Complete Google Cloud Setup**:
   - Go back to your Google Client ID settings in the Google Cloud Console.
   - Under **Authorized redirect URIs**, paste the Callback URL you copied from Supabase.
   - Save the credentials in Google Cloud.

Once configured, the Google Login button will redirect to Google's sign-in screen and return to `/dashboard` upon successful login.

