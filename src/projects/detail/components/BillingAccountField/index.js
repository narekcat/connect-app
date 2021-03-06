import React from 'react'
import {HOC as hoc} from 'formsy-react'

import Select from '../../../../components/Select/Select'
import {fetchBillingAccounts} from '../../../../api/billingAccounts'
// import {SALESFORCE_PROJECT_LEAD_LINK} from '../../../../config/constants'

import styles from './styles.module.scss'

/**
 * Build Select option from Billing Account object
 * @param {{ name: string, tcBillingAccountId: number }} billingAccountObj billing account object
 *
 * @returns {{ label: string, value: number }} option for Select
 */
const buildOption = (billingAccountObj) => ({
  label: `${billingAccountObj.name} (${billingAccountObj.tcBillingAccountId})`,
  value: billingAccountObj.tcBillingAccountId
})

class BillingAccountField extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      isLoading: true,
      billingAccounts: [],
      selectedBillingAccount: null,
    }

    this.handleChange = this.handleChange.bind(this)
  }

  componentDidMount() {
    fetchBillingAccounts(this.props.projectId)
      .catch(error => {
        // in case of error during loading billing accounts list
        // still show the empty list or currently selected value
        // and just log error to console
        console.error(error)
        return { data: [] }
      })
      .then(({ data }) => {
        let billingAccounts = data.map(buildOption)
        let selectedBillingAccount = null

        // if some value is already selected we have to find and select the option for it
        if (this.props.value) {
          selectedBillingAccount = _.find(billingAccounts, {
            value: this.props.value
          })

          // if option is not on the list, then create such option
          // this is needed if the user doesn't have access to the selected account
          if (!selectedBillingAccount) {
            selectedBillingAccount = buildOption({
              name: '<Assigned Account>',
              tcBillingAccountId: this.props.value
            })

            billingAccounts = [selectedBillingAccount, ...billingAccounts]
          }
        }

        this.setState({
          isLoading: false,
          billingAccounts,
          selectedBillingAccount,
        })
      })
  }

  handleChange(value) {
    this.setState({ selectedBillingAccount: value })
    this.props.setValue(value.value)
  }

  render() {
    const placeholder = this.state.billingAccounts.length > 0
      ? 'Select billing account'
      : 'No Billing Account Available'

    return (
      <div className={styles.container}>
        <div className={styles.fieldName}>Choose a Billing Account</div>
        <Select
          placeholder={this.state.isLoading ? 'Loading...' : placeholder}
          onChange={this.handleChange}
          value={this.state.selectedBillingAccount}
          options={this.state.billingAccounts}
          isDisabled={this.state.billingAccounts.length === 0}
        />
        {/* Hide this link because we haven't implemented a required page in SFDC yet */}
        {/* <div className={styles.manageBillingAccountLinkWrapper}>
          <a
            className={styles.manageBillingAccountLink}
            href={`${SALESFORCE_PROJECT_LEAD_LINK}${this.props.projectId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Manage the billing account in Salesforce
          </a>
        </div> */}
      </div>
    )
  }
}

export default hoc(BillingAccountField)
