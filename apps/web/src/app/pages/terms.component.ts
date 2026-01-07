import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="legal-container">
      <div class="legal-header">
        <h1>Terms of Service</h1>
        <p class="last-updated">Last Updated: January 6, 2026</p>
      </div>

      <div class="legal-content">
        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>By accessing or using Code Evolution Lab ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.</p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>Code Evolution Lab is a code analysis platform that uses evolutionary algorithms and heuristic methods to detect performance issues and generate optimized code solutions. The Service analyzes code submitted by users and provides:</p>
          <ul>
            <li>Performance issue detection</li>
            <li>Code optimization suggestions</li>
            <li>Evolutionary algorithm-based solution generation</li>
            <li>Repository management and analysis history</li>
          </ul>
        </section>

        <section>
          <h2>3. User Accounts</h2>
          <h3>3.1 Account Creation</h3>
          <ul>
            <li>You must provide accurate and complete information when creating an account</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials</li>
            <li>You must be at least 13 years old to use the Service</li>
            <li>One person or legal entity may not maintain more than one account</li>
          </ul>
          <h3>3.2 Account Security</h3>
          <ul>
            <li>You are responsible for all activities that occur under your account</li>
            <li>You must notify us immediately of any unauthorized use of your account</li>
            <li>We reserve the right to suspend or terminate accounts that violate these Terms</li>
          </ul>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <h3>4.1 You Agree NOT To:</h3>
          <ul>
            <li>Upload malicious code, viruses, or harmful content</li>
            <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
            <li>Use the Service for any illegal or unauthorized purpose</li>
            <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            <li>Overload or interfere with the proper functioning of the Service</li>
            <li>Use automated scripts or bots to access the Service without permission</li>
            <li>Submit code that you do not have the right to analyze or modify</li>
            <li>Use the Service to violate any third-party intellectual property rights</li>
          </ul>
          <h3>4.2 Code Submissions</h3>
          <ul>
            <li>You retain all rights to the code you submit to the Service</li>
            <li>You grant us a limited license to analyze, process, and store your code for the purpose of providing the Service</li>
            <li>You represent that you have the right to submit the code for analysis</li>
            <li>We do not claim ownership of your code or generated solutions</li>
          </ul>
        </section>

        <section>
          <h2>5. Intellectual Property</h2>
          <h3>5.1 Service Ownership</h3>
          <ul>
            <li>The Service, including its algorithms, design, and functionality, is owned by Code Evolution Lab</li>
            <li>Our trademarks, logos, and brand features are protected by intellectual property laws</li>
            <li>You may not use our intellectual property without prior written permission</li>
          </ul>
          <h3>5.2 User Content</h3>
          <ul>
            <li>You retain ownership of all code and content you submit</li>
            <li>Generated solutions and analysis results are provided to you under a non-exclusive license</li>
            <li>You may use the generated solutions in your projects without attribution</li>
          </ul>
        </section>

        <section>
          <h2>6. Limitation of Liability</h2>
          <p><strong>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND.</strong> To the maximum extent permitted by law, Code Evolution Lab shall not be liable for any indirect, incidental, special, or consequential damages, loss of profits, data, or business opportunities resulting from use of the Service. Analysis results and generated solutions are provided for informational purposes only. We do not guarantee accuracy or suitability. You are responsible for testing and validating any code before using it in production.</p>
        </section>

        <section>
          <h2>7. Termination</h2>
          <p>You may terminate your account at any time. We may suspend or terminate your account if you violate these Terms. Upon termination, your right to use the Service immediately ceases.</p>
        </section>

        <section>
          <h2>8. Governing Law</h2>
          <p>These Terms are governed by the laws of Australia, without regard to conflict of law principles.</p>
        </section>

        <section>
          <h2>9. Contact Information</h2>
          <p>For questions about these Terms, contact us at:</p>
          <p><strong>Email:</strong> <a href="mailto:support@codeevolutionlab.com">support@codeevolutionlab.com</a><br>
          <strong>Website:</strong> https://codeevolutionlab.com</p>
        </section>

        <section>
          <h2>10. Changes to Terms</h2>
          <p>We reserve the right to modify these Terms at any time. Your continued use of the Service after changes constitutes acceptance of the modified Terms.</p>
        </section>

        <div class="disclaimer">
          <p><strong>By using Code Evolution Lab, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.</strong></p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .legal-container { max-width: 900px; margin: 0 auto; padding: 3rem 2rem; }
    .legal-header { margin-bottom: 3rem; text-align: center;
      h1 { margin: 0 0 0.5rem; font-size: 2.5rem; font-weight: 700; color: #171717; }
      .last-updated { color: #737373; font-size: 0.875rem; }
    }
    .legal-content { section { margin-bottom: 2.5rem;
        h2 { margin: 0 0 1rem; font-size: 1.5rem; font-weight: 600; color: #171717; }
        h3 { margin: 1.5rem 0 0.75rem; font-size: 1.125rem; font-weight: 600; color: #404040; }
        p { margin: 0.75rem 0; line-height: 1.7; color: #525252; }
        ul { margin: 0.75rem 0; padding-left: 1.5rem;
          li { margin: 0.5rem 0; line-height: 1.7; color: #525252; }
        }
        a { color: #667eea; text-decoration: none; &:hover { text-decoration: underline; } }
      }
      .disclaimer { margin-top: 3rem; padding: 1.5rem; background: #f9fafb; border-left: 4px solid #667eea; border-radius: 8px;
        p { margin: 0; font-size: 0.938rem; }
      }
    }
  `]
})
export class TermsComponent {}
