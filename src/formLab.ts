// Dev-only contact sheet for the form figures (not part of the build): form-lab.html
import { mount } from 'svelte';
import '@fontsource-variable/albert-sans';
import '@fontsource/red-hat-display/800.css';
import './styles/tokens.css';
import Lab from './FormLab.svelte';
import Sheet from './PatternSheet.svelte';
mount(location.search.includes('sheet') ? Sheet : Lab, { target: document.getElementById('app')! });
