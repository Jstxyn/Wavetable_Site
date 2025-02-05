import { useState } from 'react'
import styled from 'styled-components'
import WaveformVisualizer from './components/WaveformVisualizer'

const AppContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  background: #242424;
  min-height: 100vh;
  color: white;
`

const Header = styled.header`
  margin-bottom: 2rem;
  text-align: center;
`

const Controls = styled.div`
  margin-bottom: 2rem;
  display: flex;
  gap: 1rem;
  justify-content: center;
`

const Button = styled.button`
  padding: 0.5rem 1rem;
  background: #646cff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  
  &:hover {
    background: #747bff;
  }
`

function App() {
  const [waveformType, setWaveformType] = useState('sine')

  return (
    <AppContainer>
      <Header>
        <h1>Wavetable Editor</h1>
      </Header>
      
      <Controls>
        <Button onClick={() => setWaveformType('sine')}>Sine</Button>
        <Button onClick={() => setWaveformType('square')}>Square</Button>
        <Button onClick={() => setWaveformType('sawtooth')}>Sawtooth</Button>
        <Button onClick={() => setWaveformType('triangle')}>Triangle</Button>
      </Controls>

      <WaveformVisualizer waveformType={waveformType} />
    </AppContainer>
  )
}

export default App
