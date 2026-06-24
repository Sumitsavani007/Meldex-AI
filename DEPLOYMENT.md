# Meldex AI SaaS - Deployment Guide

## Pre-Deployment Checklist

- [ ] PostgreSQL database created and running
- [ ] Environment variables configured
- [ ] OAuth credentials obtained (Google, GitHub)
- [ ] Database migrations completed
- [ ] Local testing passed
- [ ] Security review completed
- [ ] Backup strategy in place

---

## 1. Environment Setup

### Local Development

1. **Create `.env.local` file:**

```bash
cd /path/to/Meldex\ AI
cp .env.example .env.local
```

2. **Configure environment variables:**

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/meldex_ai"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"

# OAuth (from Google & GitHub consoles)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_ID=""
GITHUB_SECRET=""

# Optional APIs
OPENAI_API_KEY=""
DEEPSEEK_API_KEY=""
```

3. **Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

---

## 2. Database Setup

### PostgreSQL Installation

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Docker:**
```bash
docker run -d \
  --name meldex-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=meldex_ai \
  -p 5432:5432 \
  postgres:15-alpine
```

### Create Database & User

```bash
psql postgres
CREATE DATABASE meldex_ai;
CREATE USER meldex WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE meldex_ai TO meldex;
\q
```

### Connection String
```
postgresql://meldex:secure_password@localhost:5432/meldex_ai
```

---

## 3. Prisma Database Migration

### Push Schema to Database
```bash
npx prisma db push
```

### Alternative: Create Migrations (Recommended for Production)
```bash
npx prisma migrate dev --name init
```

### Verify Schema
```bash
npx prisma studio  # Opens web UI for database inspection
```

---

## 4. OAuth Configuration

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable "Google+ API"
4. Create "OAuth 2.0 Client ID" credentials
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/google`
6. Copy Client ID and Client Secret to `.env.local`

### GitHub OAuth Setup

1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in application details
4. Set Authorization callback URL:
   - `http://localhost:3000/api/auth/callback/github`
   - `https://yourdomain.com/api/auth/callback/github`
5. Copy Client ID and Client Secret to `.env.local`

---

## 5. Local Testing

```bash
# Install dependencies
npm install

# Run Prisma migration
npx prisma db push

# Start development server
npm run dev

# Open browser
# http://localhost:3000
```

### Test Authentication Flow
1. Visit `/register` to create an account
2. Test email/password registration
3. Test Google OAuth
4. Test GitHub OAuth
5. Visit `/dashboard` (should redirect to login if not authenticated)
6. Test `/admin` (should show unauthorized if not admin)

---

## 6. Production Deployment

### Using Vercel (Recommended)

1. **Push code to GitHub**
```bash
git add .
git commit -m "Ready for production"
git push origin main
```

2. **Connect to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com)
   - Import your GitHub repository
   - Select project

3. **Configure Environment Variables in Vercel**
   - Add all variables from `.env.local`
   - Ensure `NEXTAUTH_URL` is set to your production domain
   - Generate new `NEXTAUTH_SECRET` for production:
     ```bash
     openssl rand -base64 32
     ```

4. **Configure PostgreSQL for Production**
   - Use managed PostgreSQL service (Supabase, RDS, Heroku Postgres)
   - Update `DATABASE_URL` in Vercel

5. **Deploy**
   - Vercel will automatically deploy on push

### Using Docker

**Create Dockerfile:**
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "start"]
```

**Build and run:**
```bash
docker build -t meldex-ai:latest .
docker run -d \
  -e DATABASE_URL="..." \
  -e NEXTAUTH_URL="..." \
  -e NEXTAUTH_SECRET="..." \
  -p 3000:3000 \
  meldex-ai:latest
```

### Using AWS EC2

1. **Launch EC2 instance** (Ubuntu 22.04 LTS)

2. **Install dependencies:**
```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y nodejs npm postgresql git
```

3. **Clone and setup:**
```bash
git clone <your-repo>
cd Meldex\ AI
npm install
npx prisma db push
```

4. **Build application:**
```bash
npm run build
npm start
```

5. **Use PM2 for process management:**
```bash
npm install -g pm2
pm2 start npm --name "meldex-ai" -- start
pm2 startup
pm2 save
```

6. **Configure Nginx reverse proxy:**
```nginx
server {
  listen 80;
  server_name yourdomain.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

---

## 7. Security Hardening

### HTTPS/SSL

**Using Let's Encrypt:**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d yourdomain.com
```

**Configure Nginx with SSL:**
```nginx
server {
  listen 443 ssl http2;
  ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
  # ... rest of config
}
```

### Environment Security

- ✅ Never commit `.env.local` to git
- ✅ Use strong `NEXTAUTH_SECRET` (32+ character random string)
- ✅ Rotate OAuth secrets regularly
- ✅ Use separate credentials per environment (dev/staging/prod)
- ✅ Enable HTTPS only
- ✅ Set secure cookie flags

### Database Security

- ✅ Use strong passwords (32+ characters)
- ✅ Restrict database access to application only
- ✅ Enable SSL connections to database
- ✅ Regular backups (daily)
- ✅ Point-in-time recovery enabled
- ✅ Monitor query logs

### Application Security

- ✅ Rate limiting enabled
- ✅ CSRF protection enabled
- ✅ Path sanitization enforced
- ✅ Dangerous commands blocked
- ✅ Input validation on all endpoints
- ✅ Security headers configured

---

## 8. Monitoring & Logging

### Application Monitoring

**Sentry Integration** (error tracking):
```bash
npm install @sentry/nextjs
```

### Database Monitoring

```bash
# Monitor slow queries
psql -U meldex -d meldex_ai
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
```

### Log Aggregation

- Use Datadog, LogRocket, or similar services
- Monitor all API requests
- Track user actions via audit logs
- Set up alerts for errors

---

## 9. Backup & Recovery

### Automated PostgreSQL Backups

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U meldex meldex_ai | gzip > $BACKUP_DIR/meldex_ai_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

**Schedule with cron:**
```bash
0 2 * * * /home/user/backup.sh  # Daily at 2 AM
```

### Restore from Backup

```bash
gunzip < meldex_ai_20240624_020000.sql.gz | psql -U meldex -d meldex_ai
```

---

## 10. Performance Optimization

### Database Optimization

```sql
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'user@example.com';

-- Create indexes on frequently queried fields
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_projects_userId ON projects(userId);
CREATE INDEX idx_conversations_userId ON conversations(userId);
```

### Caching Strategy

- Use Redis for session caching
- Cache API responses with `next/cache`
- Implement CDN for static assets (Cloudflare)

### Image Optimization

- Use Next.js Image component
- Implement lazy loading
- Use WebP format

---

## 11. Scaling Considerations

### Horizontal Scaling

- Use load balancer (AWS ALB, Nginx)
- Multiple application instances
- Shared PostgreSQL database
- Redis for session store

### Database Scaling

- Read replicas for queries
- Write optimization with connection pooling
- Archive old logs regularly
- Partition large tables

### CDN Deployment

```bash
# Configure Cloudflare or similar
# Point DNS to CDN
# Configure origin server settings
```

---

## 12. Cost Optimization

### Development
- Use PostgreSQL local development
- Use free tier OAuth apps

### Staging
- Single EC2 instance or PaaS
- RDS for database
- Budget: ~$50-100/month

### Production
- Load-balanced EC2 instances
- RDS Multi-AZ
- CloudFront CDN
- Budget: ~$200-500/month depending on scale

---

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql -U meldex -d meldex_ai -h localhost

# Check Prisma logs
DEBUG=* npm run dev
```

### OAuth Not Working

- Verify redirect URIs in OAuth provider settings
- Check `NEXTAUTH_URL` matches your domain
- Ensure secrets are correct

### Performance Issues

```bash
# Check database queries
npm run dev  # Watch for slow queries
npx prisma studio  # Visual inspection
```

### Deployment Failures

```bash
# Check build logs
npm run build

# Test in production mode
npm run build && npm start
```

---

## Rollback Procedure

```bash
# Vercel: Use previous deployment
vercel rollback

# Manual deployment:
git revert <commit-hash>
npm run build
npm start

# Database rollback:
pg_restore -U meldex -d meldex_ai /backups/postgres/backup.sql.gz
```

---

## Support & Documentation

- **Next.js:** https://nextjs.org/docs
- **NextAuth.js:** https://next-auth.js.org
- **Prisma:** https://www.prisma.io/docs
- **PostgreSQL:** https://www.postgresql.org/docs
- **Vercel:** https://vercel.com/docs

---

**Last Updated:** 2026-06-24
**Status:** ✅ Ready for Deployment
