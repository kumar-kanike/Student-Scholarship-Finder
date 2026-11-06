# Student Scholarship Finder

A React + Node.js/Express + MongoDB MVP to publish scholarship opportunities, review eligibility and deadlines, and submit applications.

## Features
- Email/password registration and login with bcrypt + JWT.
- Publish scholarship listings with provider, education level, award amount, deadline and eligibility.
- Browse active listings and submit an application.
- MongoDB Atlas persistence and responsive React interface.

## Stack
React, Vite, Node.js, Express, MongoDB Atlas, Mongoose.

## Database
`scholarship_finder_db` — collections: `users`, `scholarships`, `applications`, `savedScholarships`.

## Run
Create an Atlas database user and allow the backend host IP. Copy `backend/.env.example` to `backend/.env`; set `MONGODB_URI` and a random 32+ character `JWT_SECRET`. Run `cd backend && npm install && npm run dev`; in a second terminal run `cd frontend && npm install && npm run dev`. Open port 5173.

## Production gap
Scholarship listings are user-submitted and not independently verified. Add verified sources, eligibility rules, deadline validation, document upload security, application review workflows and anti-fraud controls before production use.
