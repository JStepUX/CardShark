import { CharacterProvider } from './contexts/CharacterContext';
import Layout from './components/Layout';
import './styles/fonts.css';

function App() {
  return (
    <CharacterProvider>
      <Layout />
    </CharacterProvider>
  );
}

export default App;