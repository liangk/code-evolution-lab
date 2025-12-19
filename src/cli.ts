#!/usr/bin/env node

import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { CodeAnalyzer } from './analyzer/code-analyzer';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: code-evolution-lab <file-path> [--solutions]');
    console.log('Example: code-evolution-lab ./examples/bad-code.js');
    console.log('Options:');
    console.log('  --solutions    Generate solution suggestions for detected issues');
    process.exit(1);
  }

  const filePath = args[0];
  const generateSolutions = args.includes('--solutions');

  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\nAnalyzing: ${filePath}\n`);

  const analyzer = new CodeAnalyzer();

  try {
    const sourceCode = readFileSync(filePath, 'utf-8');
    const results = await analyzer.analyzeCode(sourceCode, filePath, generateSolutions);

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

          const issueWithSolutions = issue as any;
          if (issueWithSolutions.solutions && issueWithSolutions.solutions.length > 0) {
            console.log('\n📋 Suggested Solutions:');
            issueWithSolutions.solutions.slice(0, 3).forEach((solution: any, sIndex: number) => {
              console.log(`\n  Solution ${sIndex + 1}: ${solution.type.replace(/_/g, ' ').toUpperCase()}`);
              console.log(`  Fitness Score: ${solution.fitnessScore.toFixed(1)}/100`);
              console.log(`  Implementation Time: ~${solution.implementationTime} minutes`);
              console.log(`  Risk Level: ${solution.riskLevel.toUpperCase()}`);
              console.log(`  \n  ${solution.reasoning}`);
              
              if (sIndex === 0) {
                console.log('\n  Code Example:');
                console.log('  ' + solution.code.split('\n').join('\n  '));
              }
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
