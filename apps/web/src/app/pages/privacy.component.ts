import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="legal-container">
      <div class="legal-header">
        <h1>Privacy Policy</h1>
        <p class="last-updated">Last Updated: January 6, 2026</p>
      </div>

      <div class="legal-content">
        <section>
          <h2>1. Introduction</h2>
          <p>Code Evolution Lab ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our code analysis service ("the Service"). By using the Service, you consent to the data practices described in this policy.</p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <h3>2.1 Information You Provide</h3>
          <p><strong>Account Information:</strong> Email address, name (optional), password (encrypted), profile information</p>
          <p><strong>Code Submissions:</strong> Source code you submit for analysis, repository URLs and metadata, GitHub repository information (if connected)</p>
          <p><strong>User Preferences:</strong> Notification settings, theme preferences, language preferences</p>
          
          <h3>2.2 Automatically Collected Information</h3>
          <p><strong>Usage Data:</strong> Pages visited and features used, analysis requests and results, time spent on the Service</p>
          <p><strong>Device Information:</strong> IP address, browser type and version, operating system, device type</p>
          <p><strong>Session Information:</strong> Login timestamps, session duration, location (approximate, based on IP)</p>
          <p><strong>Cookies:</strong> Authentication tokens, session identifiers, preference cookies, analytics cookies</p>
          
          <h3>2.3 Third-Party Information</h3>
          <p><strong>OAuth Providers:</strong> Google account information (email, name, profile picture), GitHub account information (username, email, repositories)</p>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <ul>
            <li><strong>Service Delivery:</strong> Analyze your code, generate optimization solutions, store analysis history, manage repositories</li>
            <li><strong>Account Management:</strong> Create and maintain your account, authenticate your identity, process requests</li>
            <li><strong>Service Improvement:</strong> Understand usage patterns, improve algorithms, develop new features, fix bugs</li>
            <li><strong>Communication:</strong> Send analysis completion notifications, provide service updates, respond to support requests</li>
          </ul>
        </section>

        <section>
          <h2>4. Data Storage and Security</h2>
          <p>Data is stored on secure cloud servers (Neon PostgreSQL) with regular backups. We implement industry-standard security measures including:</p>
          <ul>
            <li>Encryption in transit (TLS/SSL)</li>
            <li>Encryption at rest for sensitive data</li>
            <li>Secure password hashing (bcrypt)</li>
            <li>JWT-based authentication</li>
            <li>Rate limiting and DDoS protection</li>
          </ul>
          <p><strong>Note:</strong> While we implement industry-standard security measures, no method of transmission or storage is 100% secure.</p>
        </section>

        <section>
          <h2>5. Data Sharing and Disclosure</h2>
          <p><strong>We do NOT sell your data.</strong> We may share data with trusted service providers who assist in operating the Service (cloud hosting, authentication services, analytics). These providers are contractually obligated to protect your data. We may disclose information if required by law or to protect our rights and safety.</p>
        </section>

        <section>
          <h2>6. Your Rights and Choices</h2>
          <ul>
            <li><strong>Access:</strong> View and update your profile information, access your analysis history</li>
            <li><strong>Deletion:</strong> Delete individual analyses, delete your account and associated data</li>
            <li><strong>Data Portability:</strong> Export your data in a machine-readable format</li>
            <li><strong>Opt-Out:</strong> Disable email notifications, opt out of analytics cookies, disconnect OAuth providers</li>
          </ul>
          <p>Depending on your location, you may have additional rights under GDPR (EU) or CCPA (California).</p>
        </section>

        <section>
          <h2>7. Cookies and Tracking</h2>
          <p><strong>Essential Cookies:</strong> Authentication tokens, session management (required for Service functionality)</p>
          <p><strong>Functional Cookies:</strong> User preferences, language settings, theme selection</p>
          <p><strong>Analytics Cookies:</strong> Usage statistics, performance monitoring, feature usage tracking</p>
          <p>You can control cookies through your browser settings. Note: Disabling essential cookies may affect Service functionality.</p>
        </section>

        <section>
          <h2>8. Data Retention</h2>
          <p><strong>Active Accounts:</strong> Account data retained while account is active, analysis history retained indefinitely (unless deleted)</p>
          <p><strong>Inactive Accounts:</strong> Accounts inactive for 2+ years may be deleted with notification</p>
          <p><strong>Deleted Accounts:</strong> Personal data deleted within 30 days, backups deleted within 90 days</p>
        </section>

        <section>
          <h2>9. Third-Party Links</h2>
          <p>The Service may contain links to third-party websites or integrate with third-party services (GitHub, Google). We are not responsible for the privacy practices of these third parties.</p>
        </section>

        <section>
          <h2>10. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification. Continued use of the Service after changes constitutes acceptance of the updated Privacy Policy.</p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>For privacy questions, concerns, or requests:</p>
          <p><strong>Email:</strong> <a href="mailto:privacy@codeevolutionlab.com">privacy@codeevolutionlab.com</a><br>
          <strong>Support:</strong> <a href="mailto:support@codeevolutionlab.com">support@codeevolutionlab.com</a><br>
          <strong>Website:</strong> https://codeevolutionlab.com/privacy</p>
          <p><strong>Response Time:</strong> We will respond to privacy requests within 30 days.</p>
        </section>

        <div class="disclaimer">
          <p><strong>By using Code Evolution Lab, you acknowledge that you have read and understood this Privacy Policy and consent to the collection, use, and disclosure of your information as described herein.</strong></p>
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
export class PrivacyComponent {}
