import { CharacterProvider } from './contexts/CharacterContext';
import { APIConfigProvider } from './contexts/APIConfigContext';
import Layout from './components/Layout';
import './styles/fonts.css';

function App() {
  return (
    <APIConfigProvider>
      <CharacterProvider>
        <Layout />
      </CharacterProvider>
    </APIConfigProvider>
  );
}

export default App;