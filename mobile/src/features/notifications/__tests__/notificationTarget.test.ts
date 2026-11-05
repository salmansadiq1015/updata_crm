import { notificationSchema, notificationTarget } from '../types';

const ID = '64b7f0c2a1b2c3d4e5f60701';

function notification(input: Record<string, unknown>) {
  return notificationSchema.parse({
    _id: '64b7f0c2a1b2c3d4e5f60702',
    title: 'Update',
    body: '',
    ...input,
  });
}

describe('notificationTarget', () => {
  it('routes supported related CRM entities', () => {
    expect(notificationTarget(notification({ relatedEntityType: 'Lead', relatedEntityId: ID }))).toEqual({
      screen: 'LeadDetail',
      params: { leadId: ID },
    });
    expect(
      notificationTarget(notification({ relatedEntityType: 'CallCampaign', relatedEntityId: ID })),
    ).toEqual({ screen: 'AiAgentCampaignDetail', params: { kind: 'call', campaignId: ID } });
  });

  it('accepts only implemented, valid deep links', () => {
    expect(notificationTarget(notification({ deepLink: `/crm/leads/${ID}` }))).toEqual({
      screen: 'LeadDetail',
      params: { leadId: ID },
    });
    expect(notificationTarget(notification({ deepLink: '/tasks?taskId=unsafe' }))).toBeNull();
    expect(notificationTarget(notification({ deepLink: '/crm/leads/not-an-id' }))).toBeNull();
  });

  it('routes incoming-call notifications to the call details', () => {
    expect(
      notificationTarget(notification({ relatedEntityType: 'InboundCall', relatedEntityId: ID })),
    ).toEqual({ screen: 'IncomingCallDetail', params: { id: ID } });
    expect(notificationTarget(notification({ deepLink: `/incoming-calls?call=${ID}` }))).toEqual({
      screen: 'IncomingCallDetail',
      params: { id: ID },
    });
    expect(notificationTarget(notification({ deepLink: `updata://incoming-calls/${ID}` }))).toEqual({
      screen: 'IncomingCallDetail',
      params: { id: ID },
    });
    expect(notificationTarget(notification({ deepLink: '/incoming-calls?call=nope' }))).toBeNull();
  });
});
