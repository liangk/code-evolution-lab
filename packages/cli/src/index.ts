import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze';
import { baselineCommand } from './commands/baseline';
import { replayCommand } from './commands/replay';
import packageJson from '../package.json';

const program = new Command();

program
  .name('code-evolution-lab')
  .description('Evolution-Aware Static Analysis — empirical software diagnostics as code')
  .version(packageJson.version);

program
  .command('analyze [paths...]')
  .description('Analyze a project for performance anti-patterns')
  .addHelpText('after', `

Arguments:
  paths                    One or more directories to scan (default: current
                           directory). Globs are not supported — pass
                           directories. With several, reported file paths stay
                           relative to the current directory.

Examples:
  $ code-evolution-lab analyze
  $ code-evolution-lab analyze src/server --severity high
  $ code-evolution-lab analyze src/server --category n1 --solutions
  $ code-evolution-lab analyze server/routes server/commands server/queues
`)
  .option('-s, --severity <level>', 'Minimum severity: critical|high|medium|low', 'low')
  .option('-c, --category <cat>', 'Filter by category: loop|memory|index')
  .option('-o, --output <dir>', 'Output directory', '.codeevolution')
  .option('--solutions', 'Generate a suggested rewrite for each finding (written to results.json)')
  .option('--json', 'Output JSON only (no console)')
  .option('--no-files', 'Skip writing output files')
  .action(analyzeCommand);

program
  .command('scan [paths...]')
  .description('Scan a project and save a performance snapshot to .codeevolution/baseline.json')
  .addHelpText('after', `

Arguments:
  paths                    One or more directories to scan (default: current
                           directory). Globs are not supported — pass
                           directories.

Outputs:
  - baseline.json in the selected output directory
  - current JSON, Markdown, and score reports for the latest analysis run

Behavior:
  - creates a reference snapshot of the current working tree
  - useful for CI and local guard rails before changing code

Examples:
  $ code-evolution-lab scan
  $ code-evolution-lab scan src/server
  $ code-evolution-lab scan server/routes server/commands
`)
  .option('-o, --output <dir>', 'Output directory', '.codeevolution')
  .action((paths, opts) => baselineCommand('create', paths, opts));

program
  .command('compare [paths...]')
  .description('Re-scan a project and compare it against the saved scan snapshot')
  .addHelpText('after', `

Arguments:
  paths                    One or more directories to scan (default: current
                           directory). Use the same paths you passed to 'scan'.

Behavior:
  - compares the latest scan against baseline.json
  - exits non-zero if the current score is lower than the snapshot

Examples:
  $ code-evolution-lab compare
  $ code-evolution-lab compare src/server
`)
  .option('-o, --output <dir>', 'Output directory', '.codeevolution')
  .action((paths, opts) => baselineCommand('compare', paths, opts));

program
  .command('replay [study]')
  .description('Replay study benchmarks for reproducibility validation')
  .option('--quick', 'Reduced trial count for quick validation')
  .action(replayCommand);

program.parse();
