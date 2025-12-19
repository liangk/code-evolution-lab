#!/usr/bin/env node

import { CodeAnalyzer } from './analyzer/code-analyzer';
import { existsSync } from 'fs';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: code-evolution-lab <file-path>');
    console.log('Example: code-evolution-lab ./examples/bad-code.js');
    process.exit(1);
  }

  const filePath = args[0];

  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\nAnalyzing: ${filePath}\n`);

  const analyzer = new CodeAnalyzer();

  try {
    const results = await analyzer.analyzeFile(filePath);

    let totalIssues = 0;

    for (const result of results) {
      console.log(`\n=== ${result.detectorName} ===\n`);

      if (result.issues.length === 0) {
        console.log('✓ No issues found');
      } else {
        totalIssues += result.issues.length;

        result.issues.forEach((issue, index) => {
          console.log(`\n[${index + 1}] ${issue.title}`);
          console.log(`Severity: ${issue.severity.toUpperCase()}`);
          console.log(`Location: ${issue.filePath}:${issue.lineNumber}`);
          console.log(`\nDescription:\n${issue.description}`);

          if (issue.estimatedImpact) {
            console.log('\nEstimated Impact:');
            Object.entries(issue.estimatedImpact).forEach(([key, value]) => {
              console.log(`  - ${key}: ${value}`);
            });
          }

          console.log('\n' + '-'.repeat(80));
        });
      }
    }

    console.log(`\n\nTotal Issues Found: ${totalIssues}\n`);

    if (totalIssues > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during analysis:', (error as Error).message);
    process.exit(1);
  }
}

main();
