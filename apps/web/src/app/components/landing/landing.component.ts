import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { icons } from './icons';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss']
})
export class LandingComponent {
  features = [
    {
      icon: 'database',
      title: 'N+1 Query Detection',
      description: 'Automatically identifies database query inefficiencies that slow down your application'
    },
    {
      icon: 'loop',
      title: 'Loop Optimization',
      description: 'Detects inefficient loops, nested iterations, and suggests performance improvements'
    },
    {
      icon: 'memory',
      title: 'Memory Leak Prevention',
      description: 'Finds event listeners, timers, and closures that cause memory leaks'
    },
    {
      icon: 'compress',
      title: 'Payload Optimization',
      description: 'Identifies large API responses and suggests data filtering strategies'
    },
    {
      icon: 'ai',
      title: 'AI-Powered Solutions',
      description: 'Evolutionary algorithm generates multiple optimized solutions ranked by fitness'
    },
    {
      icon: 'speed',
      title: 'Real-time Analysis',
      description: 'Get instant feedback with live progress tracking and generation-by-generation improvements'
    }
  ];

  stats = [
    { value: '4', label: 'Detectors' },
    { value: '4', label: 'Solution Generators' },
    { value: '12', label: 'Loop Patterns' }
  ];

  constructor(private router: Router, private sanitizer: DomSanitizer) {
    this.codeExample = this.sanitizer.bypassSecurityTrustHtml(
      `<span class="code-comment">// Before: N+1 Query Problem</span>
<span class="code-keyword">for</span> (<span class="code-keyword">const</span> user <span class="code-keyword">of</span> users) {
  <span class="code-keyword">const</span> posts = <span class="code-keyword">await</span> db.post.<span class="code-function">findMany</span>({
    where: { userId: user.id }
  });
}

<span class="code-comment">// After: Optimized with Include</span>
<span class="code-keyword">const</span> users = <span class="code-keyword">await</span> db.user.<span class="code-function">findMany</span>({
  <span class="code-property">include</span>: { posts: <span class="code-keyword">true</span> }
});`
    );
  }

  codeExample: SafeHtml;

  tryExample(): void {
    this.router.navigate(['/dashboard']);
  }

  analyzeRepo(): void {
    this.router.navigate(['/repositories']);
  }

  getIconSvg(iconName: string): SafeHtml {
    const icon = icons.find(i => i.name === iconName);
    return icon ? this.sanitizer.bypassSecurityTrustHtml(icon.svg) : '';
  }
}
