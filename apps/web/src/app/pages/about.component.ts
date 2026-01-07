import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="about-container">
      <div class="about-header">
        <h1>About Code Evolution Lab</h1>
        <p class="subtitle">Built to help developers fix performance pain fast</p>
      </div>

      <div class="about-content">
        <section class="mission">
          <h2>Why We Exist</h2>
          <p>We started Code Evolution Lab after shipping products that crawled under load, missed SLAs, and drained engineering time. We want developers to see performance problems as clearly as lint errors—and fix them in minutes, not days.</p>
        </section>

        <section class="mission">
          <h2>The Problems We Solve</h2>
          <div class="story-points">
            <div>
              <h3>Invisible bottlenecks</h3>
              <p>Slow pages and timeouts often hide inside N+1 queries, chatty loops, and unbounded allocations. We surface the root cause immediately.</p>
            </div>
            <div>
              <h3>Expensive guesswork</h3>
              <p>Chasing perf issues burns days of profiling and trial-and-error. We generate concrete, ranked fixes you can apply right away.</p>
            </div>
            <div>
              <h3>Fragile fixes</h3>
              <p>Quick patches tend to regress. We highlight trade-offs, expected impact, and safer patterns so fixes stick.</p>
            </div>
          </div>
        </section>

        <section class="features">
          <h2>How We Help</h2>
          <div class="feature-list">
            <div class="feature-item">
              <span class="feature-icon">🔍</span>
              <div>
                <h3>See the issue, not just the symptom</h3>
                <p>We pinpoint the exact loops, queries, and hotspots causing slowdowns—no noisy reports.</p>
              </div>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🧭</span>
              <div>
                <h3>Actionable fixes, not vague advice</h3>
                <p>Every finding comes with concrete code changes, impact notes, and safer alternatives.</p>
              </div>
            </div>
            <div class="feature-item">
              <span class="feature-icon">⚡</span>
              <div>
                <h3>Minutes to value</h3>
                <p>Paste code or point to a repo, get ranked fixes, and ship confidently in a single session.</p>
              </div>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📈</span>
              <div>
                <h3>Stay ahead of regressions</h3>
                <p>Track improvements over time and keep teams aligned on performance goals.</p>
              </div>
            </div>
          </div>
        </section>

        <section class="team">
          <h2>Built for developers, by developers</h2>
          <p>We’ve been on-call for outages, chased ghost latency, and refactored legacy codebases. Code Evolution Lab is the tool we wished we had—so we built it.</p>
          <p><a href="mailto:support@codeevolutionlab.com">support@codeevolutionlab.com</a></p>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .about-container { max-width: 900px; margin: 0 auto; padding: 3rem 2rem; }
    .about-header { text-align: center; margin-bottom: 3rem;
      h1 { margin: 0 0 0.5rem; font-size: 2.5rem; font-weight: 700; color: #171717; }
      .subtitle { color: #737373; font-size: 1.125rem; }
    }
    .about-content { section { margin-bottom: 3rem;
        h2 { margin: 0 0 1.5rem; font-size: 1.75rem; font-weight: 600; color: #171717; }
        h3 { margin: 0 0 0.5rem; font-size: 1.125rem; font-weight: 600; color: #171717; }
        p { line-height: 1.7; color: #525252; margin: 0.75rem 0; }
        ul { padding-left: 1.5rem;
          li { margin: 0.75rem 0; line-height: 1.7; color: #525252; }
        }
        a { color: #667eea; text-decoration: none; &:hover { text-decoration: underline; } }
      }
    }
    .feature-list { display: flex; flex-direction: column; gap: 1.5rem; }
    .feature-item { display: flex; gap: 1rem; align-items: flex-start;
      .feature-icon { font-size: 2rem; flex-shrink: 0; }
    }
    .story-points { display: grid; grid-template-columns: 1fr; gap: 1.5rem; @media (min-width: 768px) { grid-template-columns: repeat(3, 1fr); }
      div { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.25rem; height: 100%;
        h3 { margin-top: 0; font-size: 1.1rem; }
      }
    }
  `]
})
export class AboutComponent {}
