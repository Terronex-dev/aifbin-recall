# Contributing to AIF-BIN Recall

Thank you for your interest in contributing to AIF-BIN Recall!

## How to Contribute

### Reporting Bugs

- Check existing issues first to avoid duplicates
- Use the bug report template
- Include reproduction steps, expected vs actual behavior
- Include your environment (OS, Node.js version, etc.)

### Suggesting Features

- Open an issue with the feature request template
- Explain the use case and why it would be valuable
- Be open to discussion and iteration

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with clear messages (`git commit -m "feat: add new feature"`)
6. Push to your fork (`git push origin feature/my-feature`)
7. Open a pull request

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `test:` — Adding or updating tests
- `refactor:` — Code changes that neither fix bugs nor add features
- `perf:` — Performance improvements
- `chore:` — Maintenance tasks

### Code Style

- Use TypeScript
- Follow existing code patterns
- Add types for all public APIs
- Write tests for new functionality

## Development Setup

```bash
git clone https://github.com/Terronex-dev/aifbin-recall.git
cd aifbin-recall
npm install
npm run build
npm test
```

## Questions?

Open an issue or reach out via the project discussions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
