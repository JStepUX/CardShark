import { render, screen, fireEvent } from '@testing-library/react';
import TabNavigation from '../TabNavigation';

const mockCharacterData = {
  data: {
    name: 'Test Character',
    description: 'A brave warrior.',
    personality: 'Bold and fearless.',
    scenario: 'In a dark forest.',
    first_mes: 'Hello, traveler.',
    character_book: {
      entries: [{ keys: ['sword'], content: 'A magic sword.' }],
    },
  },
  spec: 'chara_card_v2',
  spec_version: '2.0',
};

describe('TabNavigation', () => {
  it('renders all tab buttons', () => {
    render(<TabNavigation characterData={mockCharacterData} />);

    expect(screen.getByText('Basic Info')).toBeInTheDocument();
    expect(screen.getByText('Personality')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Lore Items')).toBeInTheDocument();
    expect(screen.getByText('Worldbook')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('shows Basic Info tab content by default', () => {
    render(<TabNavigation characterData={mockCharacterData} />);

    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Character')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A brave warrior.')).toBeInTheDocument();
  });

  it('switches to Personality tab on click', () => {
    render(<TabNavigation characterData={mockCharacterData} />);

    fireEvent.click(screen.getByText('Personality'));

    expect(screen.getByText('Personality & Scenario')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bold and fearless.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('In a dark forest.')).toBeInTheDocument();
  });

  it('switches to Messages tab on click', () => {
    render(<TabNavigation characterData={mockCharacterData} />);

    fireEvent.click(screen.getByText('Messages'));

    expect(screen.getByDisplayValue('Hello, traveler.')).toBeInTheDocument();
  });

  it('switches to JSON tab and shows stringified data', () => {
    render(<TabNavigation characterData={mockCharacterData} />);

    fireEvent.click(screen.getByText('JSON'));

    expect(screen.getByText(/Test Character/)).toBeInTheDocument();
    expect(screen.getByText(/chara_card_v2/)).toBeInTheDocument();
  });

  it('handles null characterData gracefully', () => {
    render(<TabNavigation characterData={null} />);

    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    // Name input should be empty
    const nameInput = screen.getByPlaceholderText('Character name');
    expect(nameInput).toHaveValue('');
  });

  it('renders all fields as readOnly', () => {
    render(<TabNavigation characterData={mockCharacterData} />);

    const nameInput = screen.getByDisplayValue('Test Character');
    expect(nameInput).toHaveAttribute('readonly');
  });
});
