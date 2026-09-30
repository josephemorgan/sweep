import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdatePrompt } from './pwa/update-prompt';
import { DemoBanner } from './shared/demo-banner';
import { ToastHost } from './shared/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DemoBanner, ToastHost, UpdatePrompt],
  template: `<app-update-prompt /><app-demo-banner /><router-outlet /><app-toast-host />`,
})
export class App {}
