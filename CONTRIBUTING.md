# Contributing to GameRequest

Thank you for your interest in contributing to GameRequest! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Style Guidelines](#style-guidelines)
- [Project Structure](#project-structure)
- [Database Guidelines](#database-guidelines)
- [Security Guidelines](#security-guidelines)

## 🤝 Code of Conduct

This project is committed to providing a welcoming and inclusive environment for all contributors. We expect all participants to:

- Be respectful and considerate in all interactions
- Welcome newcomers and help them get started
- Focus on constructive feedback and solutions
- Respect different viewpoints and experiences
- Take responsibility for mistakes and learn from them

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js 18+** and npm installed
- **PostgreSQL 12+** running locally
- **Docker and Docker Compose** (for containerized development)
- **Git** configured with your name and email

### Finding Issues to Work On

1. Check the [Issues](https://github.com/username/ggrequestz/issues) page
2. Look for issues labeled `good-first-issue` or `help-wanted`
3. Read the issue description and existing comments
4. Comment on the issue to express your interest

## 💻 Development Setup

### Local Development

1. **Fork and Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/ggrequestz.git
   cd ggrequestz
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set Up Database**
   ```bash
   # Option 1: Use Docker
   docker compose --profile database up -d
   
   # Option 2: Local PostgreSQL
   createdb ggrequestz
   npm run db:init
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

### Docker Development

For a complete isolated environment:

```bash
# Start full development stack
docker compose -f docker-compose.yml -f docker-compose.development.yml up -d

# View logs
docker compose logs -f ggrequestz

# Rebuild after changes
docker compose build ggrequestz
```

## 🔄 Making Changes

### Branching Strategy

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-fix-name
   ```

2. **Keep Branches Focused**
   - One feature/fix per branch
   - Use descriptive branch names
   - Keep changes atomic and reviewable

3. **Branch Naming Convention**
   - `feature/description` - New features
   - `fix/description` - Bug fixes  
   - `docs/description` - Documentation updates
   - `refactor/description` - Code refactoring
   - `test/description` - Adding/fixing tests

### Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add user profile customization"
git commit -m "fix: resolve database connection timeout"
git commit -m "docs: update API documentation"
git commit -m "test: add integration tests for auth"
```

**Commit Types:**
- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Code style changes (formatting)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

1. **Unit Tests** - Test individual components/functions
   ```javascript
   // src/lib/utils.test.js
   import { formatDate } from './utils.js';
   
   describe('formatDate', () => {
     test('formats date correctly', () => {
       expect(formatDate('2023-01-01')).toBe('Jan 1, 2023');
     });
   });
   ```

2. **Integration Tests** - Test API endpoints and database operations
   ```javascript
   // tests/integration/auth.test.js
   import { test, expect } from '@playwright/test';
   
   test('user can log in', async ({ page }) => {
     await page.goto('/login');
     await page.fill('[data-testid="username"]', 'testuser');
     await page.fill('[data-testid="password"]', 'password');
     await page.click('[data-testid="login-button"]');
     await expect(page).toHaveURL('/dashboard');
   });
   ```

### Test Requirements

- All new features must include tests
- Bug fixes should include regression tests
- Maintain or improve code coverage
- Tests should be reliable and not flaky

## 📤 Submitting Changes

### Pull Request Process

1. **Ensure Tests Pass**
   ```bash
   npm run check
   npm run lint
   npm test
   ```

2. **Update Documentation**
   - Update README.md if needed
   - Add/update API documentation
   - Include migration guides for breaking changes

3. **Create Pull Request**
   - Use a descriptive title
   - Fill out the PR template completely
   - Link related issues
   - Request review from maintainers

### Pull Request Template

When creating a PR, include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] New tests added for functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## 🎨 Style Guidelines

### Code Style

We use **Prettier** and **ESLint** for consistent code formatting:

```bash
# Format code
npm run format

# Check linting
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

### Svelte/JavaScript Guidelines

1. **Component Structure**
   ```svelte
   <!-- Component.svelte -->
   <script>
     // Props and state first
     let { data } = $props();
     let loading = $state(false);
     
     // Derived values
     let processedData = $derived(data.map(item => transform(item)));
     
     // Functions
     function handleClick() {
       // Implementation
     }
   </script>
   
   <!-- Template -->
   <div class="component">
     <!-- Content -->
   </div>
   
   <style>
     /* Component-specific styles */
   </style>
   ```

2. **Naming Conventions**
   - Use camelCase for variables and functions
   - Use PascalCase for components
   - Use kebab-case for CSS classes
   - Use SCREAMING_SNAKE_CASE for constants

3. **Import Organization**
   ```javascript
   // External libraries first
   import { onMount } from 'svelte';
   import { page } from '$app/stores';
   
   // Internal utilities
   import { formatDate } from '$lib/utils.js';
   
   // Components last
   import Button from '$components/Button.svelte';
   ```

### CSS Guidelines

1. **Use Tailwind CSS** for utility classes
2. **Component styles** for component-specific styling
3. **CSS custom properties** for theme consistency
4. **Responsive design** with mobile-first approach

```css
/* Good */
.component {
  @apply bg-white dark:bg-gray-800 rounded-lg shadow-sm;
  
  /* Custom properties for consistency */
  border-color: var(--border-color);
}

/* Responsive utilities */
@screen md {
  .component {
    @apply grid-cols-2;
  }
}
```

## 📁 Project Structure

Understanding the project structure helps with navigation:

```
src/
├── routes/                 # SvelteKit routes
│   ├── +layout.svelte     # Main app layout
│   ├── +page.svelte       # Homepage
│   ├── api/               # API endpoints
│   ├── admin/             # Admin interface
│   ├── auth/              # Authentication
│   └── setup/             # First-run setup
├── lib/                   # Shared utilities
│   ├── auth.js           # Authentication helpers
│   ├── database.js       # Database client
│   ├── cache.js          # Caching utilities
│   └── utils.js          # General utilities
├── components/           # Reusable UI components
├── app.css              # Global styles
└── app.html            # HTML template

scripts/                  # Build and utility scripts
migrations/              # Database migrations
static/                  # Static assets
```

## 🗄️ Database Guidelines

### Migration Guidelines

1. **Always use migrations** for schema changes
2. **Name migrations descriptively** with timestamps
3. **Include rollback procedures** where possible
4. **Test migrations** on sample data

```javascript
// migrations/007_add_user_preferences.sql
-- Add user preferences table
CREATE TABLE ggr_user_preferences (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES ggr_users(id),
  preference_key VARCHAR(100) NOT NULL,
  preference_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, preference_key)
);

-- Add indexes for performance
CREATE INDEX idx_user_preferences_user_id ON ggr_user_preferences(user_id);
CREATE INDEX idx_user_preferences_key ON ggr_user_preferences(preference_key);
```

### Database Naming Conventions

- **Tables**: `ggr_table_name` (plural, snake_case)
- **Columns**: `column_name` (snake_case)
- **Indexes**: `idx_table_column` 
- **Foreign Keys**: `fk_table_column`
- **Primary Keys**: `id` (SERIAL)

## 🔒 Security Guidelines

### Security Best Practices

1. **Never commit secrets** to the repository
2. **Validate all inputs** on both client and server
3. **Use parameterized queries** to prevent SQL injection
4. **Sanitize user content** before displaying
5. **Follow OWASP guidelines** for web security

### Input Validation Example

```javascript
// Good - Server-side validation
export async function POST({ request }) {
  const data = await request.json();
  
  // Validate required fields
  if (!data.title || typeof data.title !== 'string') {
    return json({ error: 'Invalid title' }, { status: 400 });
  }
  
  // Sanitize input
  const sanitizedTitle = data.title.trim().slice(0, 200);
  
  // Use parameterized query
  const result = await query(
    'INSERT INTO ggr_games (title) VALUES ($1) RETURNING id',
    [sanitizedTitle]
  );
  
  return json({ success: true, id: result.rows[0].id });
}
```

## 🤔 Questions and Support

### Getting Help

- **Documentation**: Check README.md and docs/
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Discord/Chat**: Join our community chat (if available)

### Asking Good Questions

When asking for help:

1. **Describe the problem** clearly and concisely
2. **Include relevant code** snippets or error messages
3. **Mention your environment** (OS, Node version, etc.)
4. **Show what you've tried** already
5. **Provide minimal reproduction** steps

## 🎉 Recognition

Contributors are recognized in:

- **README.md** - Contributors section
- **Release notes** - Major contributions
- **Hall of Fame** - Outstanding contributors

Thank you for contributing to GameRequest! Every contribution, no matter how small, helps make this project better for everyone.

---

**Happy Contributing! 🚀**