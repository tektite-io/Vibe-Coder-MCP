# NPM Publishing Guide for Vibe Coder MCP

## Prerequisites

1. **NPM Account**: Ensure you have an npm account at https://www.npmjs.com/
2. **Authentication**: Login to npm CLI
   ```bash
   npm login
   ```
3. **Permissions**: Ensure you have publishing rights to `vibe-coder-mcp`

## Pre-Publishing Checklist

### 1. Ensure PR is Merged
- [ ] PR merged to master
- [ ] All CI checks passed (type-check, lint, build)
- [ ] No merge conflicts

### 2. Update Local Repository
```bash
git checkout master
git pull origin master
```

### 3. Run Validation (Matches CI Pipeline)
```bash
# Essential checks (same as CI pipeline - ~3 minutes)
npm run type-check    # TypeScript strict mode validation
npm run lint          # ESLint code quality
npm run build         # Build distributable

# Local-only validation (recommended before publishing)
npm run test:unit     # Fast unit tests (2-3 minutes)

# Package verification
npm pack --dry-run    # Review included files
```

**Note**: CI pipeline runs essential checks only (70% faster). Unit tests are run locally by developers.

### 4. Version Bump
```bash
# For patch release (0.2.2 -> 0.2.3)
npm version patch

# For minor release (0.2.x -> 0.3.0)
npm version minor

# For major release (0.x.x -> 1.0.0)
npm version major
```

## Publishing Steps

### 1. Publish to NPM

```bash
# Publish to npm registry
npm publish

# If you need to use 2FA
npm publish --otp=YOUR_2FA_CODE
```

### 2. Verify Publication

```bash
# Check npm registry
npm view vibe-coder-mcp@latest

# Test installation
npm install -g vibe-coder-mcp@latest
vibe --version
```

### 3. Create GitHub Release

```bash
# Using GitHub CLI
gh release create v0.2.3 \
  --title "v0.2.3: Configuration & Onboarding Improvements" \
  --notes-file RELEASE_NOTES_v0.2.3.md \
  --target master

# Or manually on GitHub:
# 1. Go to https://github.com/freshtechbro/Vibe-Coder-MCP/releases
# 2. Click "Draft a new release"
# 3. Tag: v0.2.3
# 4. Title: v0.2.3: Configuration & Onboarding Improvements
# 5. Copy content from RELEASE_NOTES_v0.2.3.md
# 6. Click "Publish release"
```

### 4. Update GitHub Packages (Optional)

GitHub Packages will automatically sync with npm registry if configured.

## Post-Publishing

### 1. Announce Release

- Update README.md with new version badge
- Post in relevant channels/communities
- Update documentation if needed

### 2. Monitor

```bash
# Check download stats
npm view vibe-coder-mcp

# Monitor issues
gh issue list --label bug

# Check npm package page
open https://www.npmjs.com/package/vibe-coder-mcp
```

## Troubleshooting

### Issue: 403 Forbidden
**Solution**: Ensure you're logged in and have publish permissions
```bash
npm whoami
npm login
```

### Issue: Version Already Exists
**Solution**: Bump version before publishing
```bash
npm version patch
npm publish
```

### Issue: Package Too Large
**Solution**: Check `.npmignore` and exclude unnecessary files
```bash
npm pack --dry-run
# Review included files
```

### Issue: Failed Tests
**Solution**: Fix tests before publishing
```bash
npm run test:unit
npm run lint
npm run type-check
```

## Rollback Procedure

If issues are discovered after publishing:

### 1. Deprecate Problematic Version
```bash
npm deprecate vibe-coder-mcp@0.2.3 "Critical bug found, use 0.2.2 instead"
```

### 2. Publish Fix
```bash
git checkout master
# Fix the issue
npm version patch  # Creates 0.2.4
npm publish
```

### 3. Update GitHub Release
Mark the problematic release as pre-release or add warning notes.

## CI/CD Integration

### Current Pipeline (Simplified for Performance)
The GitHub Actions workflow automatically runs on all PRs and pushes:
1. **Type Check**: TypeScript strict mode validation (no `any` types allowed)
2. **Lint**: ESLint code quality checks
3. **Build**: Compile TypeScript to JavaScript distributable

**Performance**: ~3 minutes (70% faster than previous full test suite)

### Testing Strategy
- **CI Pipeline**: Essential checks only (type-check, lint, build)
- **Local Development**: Developers run unit tests before PR submission
- **Rationale**: Faster feedback loop, reduced CI costs, maintains quality

### Future Auto-Publishing (Optional)
To enable automated npm publishing on releases:
1. Add `NPM_TOKEN` to GitHub Secrets
2. Create `.github/workflows/release.yml` with publish job
3. Configure to trigger on GitHub releases

## Security Notes

- **Never commit** `.npmrc` with auth tokens
- **Use 2FA** for npm account
- **Rotate tokens** regularly
- **Review** package contents before publishing

## Support

For publishing issues:
- npm support: https://www.npmjs.com/support
- GitHub Issues: https://github.com/freshtechbro/Vibe-Coder-MCP/issues

---

Last updated: January 2025
Version: 0.2.3