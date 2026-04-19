import * as React from 'react';
import Helmet from 'react-helmet';
import {
  PageSection,
  Title,
  Split,
  SplitItem,
  TextInput,
  TextArea,
  Button,
  Card,
  CardBody,
  EmptyState,
  EmptyStateBody,
  Spinner,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Nav,
  NavItem,
  NavList,
  Checkbox,
  Label,
  LabelGroup,
  ExpandableSection,
} from '@patternfly/react-core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  listSessions,
  createSession,
  getSession,
  deleteSession,
  sendMessage,
  listEndpoints,
  listModels,
  listSkills,
  updateSessionSkills,
  Session,
  Message,
  MaaSEndpoint,
  ModelInfo,
  Skill,
} from '../utils/api';
import './styles.css';

export default function ChatPage() {
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showNewSession, setShowNewSession] = React.useState(false);
  const [endpoints, setEndpoints] = React.useState<MaaSEndpoint[]>([]);
  const [models, setModels] = React.useState<ModelInfo[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = React.useState('');
  const [selectedModelId, setSelectedModelId] = React.useState('');
  const [skills, setSkills] = React.useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = React.useState<number[]>([]);
  const [sessionSkillIds, setSessionSkillIds] = React.useState<number[]>([]);
  const [skillsExpanded, setSkillsExpanded] = React.useState(false);
  const [temperature, setTemperature] = React.useState(0.2);
  const [maxTokens, setMaxTokens] = React.useState(2048);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    loadSessions();
    loadEndpoints();
    loadSkills();
  }, []);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const data = await listSessions();
      setSessions(data || []);
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
  };

  const loadEndpoints = async () => {
    try {
      const data = await listEndpoints();
      setEndpoints(data || []);
    } catch (e) {
      console.error('Failed to load endpoints', e);
    }
  };

  const loadSkills = async () => {
    try {
      const data = await listSkills();
      setSkills(data || []);
    } catch (e) {
      console.error('Failed to load skills', e);
    }
  };

  const loadModelsForEndpoint = async (endpointId: string) => {
    try {
      const data = await listModels(endpointId ? parseInt(endpointId) : undefined);
      setModels(data || []);
      if (data && data.length > 0) setSelectedModelId(data[0].id);
    } catch (e) {
      console.error('Failed to load models', e);
      setModels([]);
    }
  };

  const selectSession = async (id: string) => {
    setCurrentSessionId(id);
    try {
      const data = await getSession(id);
      setMessages(data.messages || []);
      setSessionSkillIds(data.skill_ids || []);
    } catch (e) {
      console.error('Failed to load session', e);
    }
  };

  const handleNewSession = async () => {
    try {
      const selectedModel = models.find(m => m.id === selectedModelId);
      const result = await createSession({
        provider: 'openai-compatible',
        model: selectedModelId,
        base_url: selectedModel?.url,
        skill_ids: selectedSkillIds,
        temperature,
        max_tokens: maxTokens,
      });
      setShowNewSession(false);
      await loadSessions();
      selectSession(result.id);
    } catch (e) {
      console.error('Failed to create session', e);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !currentSessionId) return;
    const msg = input;
    setInput('');
    setMessages(prev => [...prev, { id: 0, session_id: currentSessionId, role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setLoading(true);
    try {
      const data = await sendMessage(currentSessionId, msg);
      setMessages(prev => [...prev, { id: 0, session_id: currentSessionId, role: 'assistant', content: data.response, timestamp: new Date().toISOString() }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { id: 0, session_id: currentSessionId, role: 'assistant', content: 'Error: ' + e.message, timestamp: new Date().toISOString() }]);
    }
    setLoading(false);
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setMessages([]);
      setSessionSkillIds([]);
    }
    loadSessions();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleNewSessionSkill = (skillId: number, checked: boolean) => {
    setSelectedSkillIds(prev =>
      checked ? [...prev, skillId] : prev.filter(id => id !== skillId)
    );
  };

  const toggleSessionSkill = async (skillId: number, checked: boolean) => {
    if (!currentSessionId) return;
    const newIds = checked
      ? [...sessionSkillIds, skillId]
      : sessionSkillIds.filter(id => id !== skillId);
    setSessionSkillIds(newIds);
    try {
      await updateSessionSkills(currentSessionId, newIds);
    } catch (e) {
      console.error('Failed to update session skills', e);
    }
  };

  const enabledSkills = skills.filter(s => s.enabled);

  return (
    <>
      <Helmet><title>Skills Chat</title></Helmet>
        <PageSection>
          <Split hasGutter>
            <SplitItem className="skills-sidebar">
              <Button variant="primary" isBlock onClick={() => {
                setShowNewSession(true);
                loadEndpoints();
                loadSkills();
                setSelectedSkillIds(enabledSkills.map(s => s.id));
                setTemperature(0.2);
                setMaxTokens(2048);
              }}>
                New Chat
              </Button>
              <Nav aria-label="Sessions">
                <NavList>
                  {sessions.map(s => (
                    <NavItem
                      key={s.id}
                      isActive={s.id === currentSessionId}
                      onClick={() => selectSession(s.id)}
                    >
                      <Split>
                        <SplitItem isFilled>{s.name}</SplitItem>
                        <SplitItem>
                          <Button variant="plain" isDanger onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}>
                            x
                          </Button>
                        </SplitItem>
                      </Split>
                    </NavItem>
                  ))}
                </NavList>
              </Nav>
            </SplitItem>

            <SplitItem isFilled>
              {!currentSessionId ? (
                <EmptyState>
                  <Title headingLevel="h2" size="lg">Skills Chat</Title>
                  <EmptyStateBody>
                    Select a session or start a new chat. Configure MaaS endpoints in Settings first.
                  </EmptyStateBody>
                </EmptyState>
              ) : (
                <Card className="chat-container">
                  <div className="chat-skills-bar">
                    <ExpandableSection
                      toggleText={`Skills (${sessionSkillIds.length} selected)`}
                      isExpanded={skillsExpanded}
                      onToggle={(_e, expanded) => setSkillsExpanded(expanded)}
                    >
                      <div className="chat-skills-list">
                        {enabledSkills.length === 0 ? (
                          <span className="pf-v6-u-color-200">No skills available. Upload skills in the Skills page.</span>
                        ) : (
                          enabledSkills.map(s => (
                            <Checkbox
                              key={s.id}
                              id={`session-skill-${s.id}`}
                              label={s.name}
                              isChecked={sessionSkillIds.includes(s.id)}
                              onChange={(_e, checked) => toggleSessionSkill(s.id, checked)}
                            />
                          ))
                        )}
                      </div>
                    </ExpandableSection>
                    {sessionSkillIds.length > 0 && !skillsExpanded && (
                      <LabelGroup className="pf-v6-u-mt-xs">
                        {sessionSkillIds.map(id => {
                          const skill = skills.find(s => s.id === id);
                          return skill ? <Label key={id} isCompact color="blue">{skill.name}</Label> : null;
                        })}
                      </LabelGroup>
                    )}
                  </div>
                  <CardBody className="chat-messages">
                    {messages.map((m, i) => (
                      <div key={i} className={`chat-message chat-message-${m.role}`}>
                        <div className="chat-message-header">
                          <span className="chat-message-role">{m.role}</span>
                          <span className="chat-message-time">{new Date(m.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="chat-message-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                    {loading && <div className="chat-message chat-message-assistant"><Spinner size="md" /> Thinking...</div>}
                    <div ref={messagesEndRef} />
                  </CardBody>
                  <div className="chat-input-bar">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <TextArea
                          value={input}
                          onChange={(_e, val) => setInput(val)}
                          onKeyPress={handleKeyPress}
                          placeholder="Type a message... (Shift+Enter for new line)"
                          aria-label="Chat message"
                          rows={3}
                          autoResize
                        />
                      </div>
                      <Button variant="primary" onClick={handleSend} isDisabled={loading || !input.trim()}>
                        Send
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </SplitItem>
          </Split>
        </PageSection>

      <Modal
        variant={ModalVariant.small}
        isOpen={showNewSession}
        onClose={() => setShowNewSession(false)}
      >
        <ModalHeader title="New Chat Session" />
        <ModalBody>
          <FormGroup label="MaaS Endpoint" fieldId="endpoint">
            <FormSelect
              id="endpoint"
              value={selectedEndpoint}
              onChange={(_e, val) => { setSelectedEndpoint(val); loadModelsForEndpoint(val); }}
            >
              <FormSelectOption key="" value="" label="-- Select endpoint --" />
              {endpoints.map(e => (
                <FormSelectOption key={e.id} value={e.id.toString()} label={e.name + ' (' + e.url + ')'} />
              ))}
            </FormSelect>
          </FormGroup>
          <FormGroup label="Model" fieldId="model">
            <FormSelect id="model" value={selectedModelId} onChange={(_e, val) => setSelectedModelId(val)}>
              {models.length === 0 && <FormSelectOption value="" label="-- Select endpoint first --" />}
              {models.map(m => (
                <FormSelectOption key={m.id} value={m.id} label={m.display_name + (m.ready ? '' : ' (not ready)')} />
              ))}
            </FormSelect>
          </FormGroup>
          <FormGroup label="Skills" fieldId="skills">
            {enabledSkills.length === 0 ? (
              <span className="pf-v6-u-color-200">No enabled skills available.</span>
            ) : (
              enabledSkills.map(s => (
                <Checkbox
                  key={s.id}
                  id={`new-session-skill-${s.id}`}
                  label={s.name}
                  description={s.description}
                  isChecked={selectedSkillIds.includes(s.id)}
                  onChange={(_e, checked) => toggleNewSessionSkill(s.id, checked)}
                  className="pf-v6-u-mb-xs"
                />
              ))
            )}
          </FormGroup>
          <FormGroup label="Temperature" fieldId="temperature">
            <TextInput id="temperature" type="number" value={temperature} onChange={(_e, val) => setTemperature(parseFloat(val) || 0)} min={0} max={2} step={0.1} />
          </FormGroup>
          <FormGroup label="Max Tokens" fieldId="max-tokens">
            <TextInput id="max-tokens" type="number" value={maxTokens} onChange={(_e, val) => setMaxTokens(parseInt(val) || 0)} min={0} step={256} />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleNewSession} isDisabled={!selectedModelId}>Create</Button>
          <Button variant="link" onClick={() => setShowNewSession(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
