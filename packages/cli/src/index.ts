import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze';
import { baselineCommand } from './commands/baseline';
import { replayCommand } from './commands/replay';

const program = new Command();

program
  .name('code-evolution-lab')
  .description('Evolution-Aware Static Analysis — empirical software diagnostics as code')
  .version('1.0.0');

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
  .command('baseline <action>')
  .description('Create or compare static-analysis baseline snapshots for the current project')
  .addHelpText('after', `

Actions:
  create   Analyze the current directory and save a baseline snapshot to baseline.json.
  compare  Re-analyze the current directory and compare results against an existing baseline.

Outputs:
  - baseline.json in the selected output directory
  - current JSON, Markdown, and score reports for the latest analysis run

Behavior:
  - compare exits with a non-zero status if the current score is lower than the saved baseline
  - useful for CI checks that guard against regressions

Examples:
  $ code-evolution-lab baseline create
  $ code-evolution-lab baseline compare
  $ code-evolution-lab baseline create --output .codeevolution
  $ code-evolution-lab baseline compare --output .codeevolution
`)
  .option('-o, --output <dir>', 'Output directory', '.codeevolution')
  .action(baselineCommand);

program
  .command('replay [study]')
  .description('Replay study benchmarks for reproducibility validation')
  .option('--quick', 'Reduced trial count for quick validation')
  .action(replayCommand);

program.parse();
