import '@fontsource-variable/albert-sans';
import '@fontsource/red-hat-display/600.css';
import '@fontsource/red-hat-display/800.css';
import './styles/tokens.css';
import './styles/base.css';
import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
