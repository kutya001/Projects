// src/core/router.js
import { bus } from './events.js';

class Router {
  constructor() {
    this.routes = new Map();
    window.addEventListener('hashchange', () => this.handleHashChange());
  }

  on(event, fn) {
    return bus.on(event, fn);
  }

  register(page, handler) {
    this.routes.set(page, handler);
  }

  getRoute() {
    return location.hash.replace('#/', '') || 'projects';
  }

  handleHashChange() {
    const page = this.getRoute();
    bus.emit('route:change', page);
  }

  go(page) {
    if (location.hash !== '/' + page) {
      location.hash = '/' + page;
    } else {
      bus.emit('route:change', page);
    }
  }

  start() {
    this.handleHashChange();
  }
}

export const router = new Router();
