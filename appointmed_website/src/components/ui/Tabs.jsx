import { useState } from 'react'
import './Tabs.css'

const Tabs = ({ tabs, defaultTab = 0, onChange, className = '' }) => {
  const [activeTab, setActiveTab] = useState(defaultTab)

  const handleTabChange = (index) => {
    setActiveTab(index)
    onChange?.(index)
  }

  return (
    <div className={`tabs ${className}`}>
      <div className="tabs__list" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={index}
            role="tab"
            aria-selected={activeTab === index}
            className={`tabs__tab ${activeTab === index ? 'tabs__tab--active' : ''}`}
            onClick={() => handleTabChange(index)}
          >
            {tab.icon && <span className="tabs__tab-icon">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span className="tabs__tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
      <div className="tabs__content" role="tabpanel">
        {tabs[activeTab]?.content}
      </div>
    </div>
  )
}

export default Tabs