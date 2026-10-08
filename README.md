<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## Run Locally

**Prerequisites:** Node.js, Supabase CLI, and a Supabase project.

1. Install dependencies:
   `npm install`
2. Create `.env.local` based on `.env.example` and set:
   - `VITE_SUPABASE_URL` to your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` to your Supabase anon (public) key
3. Start Supabase locally:
   `npm run supabase:start`
4. Apply migrations and seed auth user:
   `npm run supabase:reset`
5. Run the app:
   `npm run dev`

## Production Setup (Vercel + Hosted Supabase)

1. Create a hosted Supabase project and copy:
   - Project URL (for `VITE_SUPABASE_URL`)
   - anon key (for `VITE_SUPABASE_ANON_KEY`)
2. Link this repo to the hosted project:
   - `supabase login`
   - `supabase link --project-ref <your_project_ref>`
3. Push migrations:
   - `supabase db push`
4. In Vercel project settings, add env vars:
   - `VITE_SUPABASE_URL` = your hosted Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your hosted anon key
5. Deploy:
   - `vercel`
   - `vercel --prod`
