import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="contact-container">
      <div class="contact-header">
        <h1>Contact Us</h1>
        <p class="subtitle">We'd love to hear from you</p>
      </div>

      <div class="contact-content">
        <div class="contact-info">
          <h2>Get in Touch</h2>
          <p>We answer every message—performance incidents, product feedback, or partnership ideas. Email us and we’ll respond within one business day.</p>
          
          <div class="contact-methods">
            <div class="contact-method">
              <span class="method-icon">📧</span>
              <div>
                <h3>Email</h3>
                <p><a href="mailto:support@codeevolutionlab.com">support@codeevolutionlab.com</a></p>
                <span class="response-time">Response within 24 hours</span>
              </div>
            </div>
          </div>
        </div>

        <div class="contact-form-section">
          <h2>Send a Message</h2>
          
          @if (submitted()) {
            <div class="success-message">
              <span class="success-icon">✓</span>
              <p>Thank you for your message! We'll get back to you soon.</p>
            </div>
          } @else {
            <form class="contact-form" name="contact" method="POST" netlify netlify-honeypot="bot-field" (ngSubmit)="submitForm()">
              <input type="hidden" name="form-name" value="contact" />
              <div class="hidden-field">
                <label>Don’t fill this out if you're human: <input name="bot-field" /></label>
              </div>
              <div class="form-group">
                <label for="name">Name</label>
                <input id="name" type="text" [(ngModel)]="formData.name" name="name" required placeholder="Your name" />
              </div>

              <div class="form-group">
                <label for="email">Email</label>
                <input id="email" type="email" [(ngModel)]="formData.email" name="email" required placeholder="your@email.com" />
              </div>

              <div class="form-group">
                <label for="subject">Subject</label>
                <input id="subject" type="text" [(ngModel)]="formData.subject" name="subject" required placeholder="How can we help?" />
              </div>

              <div class="form-group">
                <label for="message">Message</label>
                <textarea id="message" [(ngModel)]="formData.message" name="message" required rows="6" placeholder="Your message..."></textarea>
              </div>

              <button type="submit" class="btn btn-primary">Send Message</button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .contact-container { max-width: 1000px; margin: 0 auto; padding: 3rem 2rem; }
    .contact-header { text-align: center; margin-bottom: 3rem;
      h1 { margin: 0 0 0.5rem; font-size: 2.5rem; font-weight: 700; color: #171717; }
      .subtitle { color: #737373; font-size: 1.125rem; }
    }
    .contact-content { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem;
      @media (max-width: 768px) { grid-template-columns: 1fr; }
    }
    .contact-info { h2 { margin: 0 0 1rem; font-size: 1.5rem; font-weight: 600; color: #171717; }
      p { line-height: 1.7; color: #525252; margin-bottom: 2rem; }
    }
    .contact-methods { display: flex; flex-direction: column; gap: 1.5rem; }
    .contact-method { display: flex; gap: 1rem; padding: 1.5rem; background: #f9fafb; border-radius: 8px;
      .method-icon { font-size: 2rem; flex-shrink: 0; }
      h3 { margin: 0 0 0.25rem; font-size: 1.125rem; font-weight: 600; color: #171717; }
      p { margin: 0; }
      a { color: #667eea; text-decoration: none; &:hover { text-decoration: underline; } }
      .response-time { font-size: 0.875rem; color: #737373; display: block; margin-top: 0.25rem; }
    }
    .contact-form-section { h2 { margin: 0 0 1.5rem; font-size: 1.5rem; font-weight: 600; color: #171717; } }
    .contact-form { display: flex; flex-direction: column; gap: 1.25rem;
      .form-group { display: flex; flex-direction: column;
        label { margin-bottom: 0.5rem; font-weight: 500; color: #404040; }
        input, textarea { padding: 0.75rem; border: 1px solid #e5e5e5; border-radius: 6px; font-size: 0.938rem;
          &:focus { outline: none; border-color: #667eea; }
        }
        textarea { resize: vertical; font-family: inherit; }
      }
    }
    .hidden-field { display: none; }
    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; font-size: 0.938rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
      &.btn-primary { background: #667eea; color: white; &:hover { background: #5568d3; } }
    }
    .success-message { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;
      .success-icon { font-size: 1.5rem; color: #16a34a; }
      p { margin: 0; color: #166534; }
    }
  `]
})
export class ContactComponent {
  submitted = signal(false);
  formData = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };

  submitForm() {
    console.log('Form submitted:', this.formData);
    this.submitted.set(true);
    setTimeout(() => {
      this.submitted.set(false);
      this.formData = { name: '', email: '', subject: '', message: '' };
    }, 5000);
  }
}
