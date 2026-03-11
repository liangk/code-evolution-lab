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
  .command('analyze [path]')
  .description('Analyze a project for performance anti-patterns')
  .option('-s, --severity <level>', 'Minimum severity: critical|high|medium|low', 'low')
  .option('-c, --category <cat>', 'Filter by category: loop|memory|index')
  .option('-o, --output <dir>', 'Output directory', '.codeevolution')
  .option('--json', 'Output JSON only (no console)')
  .option('--no-files', 'Skip writing output files')
  .action(analyzeCommand);

program
  .command('scan')
  .description('Scan the current project and save a performance snapshot to .codeevolution/baseline.json')
  .addHelpText('after', `

Outputs:
  - baseline.json in the selected output directory
  - current JSON, Markdown, and score reports for the latest analysis run

Behavior:
  - creates a reference snapshot of the current working tree
  - useful for CI and local guard rails before changing code

Examples:
  $ code-evolution-lab scan
  $ code-evolution-lab scan --output .codeevolution
`)
  .option('-o, --output <dir>', 'Output directory', '.codeevolution')
  .action(opts => baselineCommand('create', opts));

program
  .command('compare')
  .description('Re-scan the current project and compare it against the saved scan snapshot')
  .addHelpText('after', `

Behavior:
  - compares the latest scan against baseline.json
  - exits non-zero if the current score is lower than the snapshot

Examples:
  $ code-evolution-lab compare
  $ code-evolution-lab compare --output .codeevolution
`)
  .option('-o, --output <dir>', 'Output directory', '.codeevolution')
  .action(opts => baselineCommand('compare', opts));

program
  .command('replay [study]')
  .description('Replay study benchmarks for reproducibility validation')
  .option('--quick', 'Reduced trial count for quick validation')
  .action(replayCommand);

program.parse();
