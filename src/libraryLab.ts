// Preview-only entry for library-lab.html (not part of the app build).
import { mount } from 'svelte';
import '@fontsource-variable/albert-sans';
import '@fontsource/red-hat-display/800.css';
import './styles/tokens.css';
import Lab from './LibraryLab.svelte';
mount(Lab, { target: document.getElementById('app')! });
