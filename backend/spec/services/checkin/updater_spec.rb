require "rails_helper"

RSpec.describe Checkin::Updater do
  let(:user) { create(:user) }
  let(:checkin) { create(:checkin, user_id: user.id, date: Time.zone.today) }

  subject { Checkin::Updater.new(user, params).update! }

  context "with permitted params" do
    let(:params) { ActionController::Parameters.new(id: checkin.id.to_s, checkin: {note: "Blah"}) }
    it "returns updated checkin" do
      expect(subject.id).to eq checkin.id
      expect(subject.note).to eq params[:checkin][:note]
    end
  end

  context "with non-permitted params" do
    let(:params) { ActionController::Parameters.new(id: checkin.id.to_s, checkin: {date: Date.yesterday}) }
    it "returns checkin with no changes" do
      expect(subject.id).to eq checkin.id
      expect(subject.date).not_to eq params[:checkin][:date]
    end
  end

  context "when recent dose exists for treatment in user's profile" do
    let(:treatment) { create(:treatment) }

    let(:params) do
      ActionController::Parameters.new(
        id: checkin.id.to_s,
        checkin: {treatments_attributes: [{treatment_id: treatment.id}]}
      )
    end

    before do
      user.profile.set_most_recent_dose(treatment.id, "20 mg")
      user.profile.save!
    end
    it "auto-sets the most recently used dose on added treatments" do
      returned_treatment = subject.treatments[0]
      expect(returned_treatment.treatment_id).to eq treatment.id
      saved_dose = user.profile.most_recent_dose_for(treatment.id)
      expect(returned_treatment.value).to eq saved_dose
    end
  end

  context "trackable usages" do
    context "when removing a trackable" do
      let!(:checkin_condition) { create(:checkin_condition, checkin: checkin) }
      let!(:condition) { Condition.find(checkin_condition.condition_id) }
      let!(:usage) { create(:trackable_usage, user: user, trackable: condition) }
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: [{
              id: checkin_condition.id.to_s,
              condition_id: checkin_condition.condition_id,
              _destroy: "1"
            }]
          }
        )
      end
      context "used once before" do
        it "removes trackable and usage record" do
          expect(subject.conditions.map(&:id)).not_to include checkin_condition.id
          expect(TrackableUsage.find_by(user: user, trackable: condition)).to be_nil
        end
      end
      context "used more than once before" do
        let!(:previous_count) { usage.count }
        before { usage.increment! :count }
        it "removes trackable and decrements count on usage record" do
          expect(subject.conditions.map(&:id)).not_to include checkin_condition.id
          expect(usage.count).to eq(previous_count + 1)
        end
      end
    end

    context "when adding a trackable" do
      let!(:condition) { create(:condition) }
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: [{
              condition_id: condition.id
            }]
          }
        )
      end
      context "never used before" do
        it "adds trackable and creates a new usage record" do
          expect(subject.conditions.map(&:condition_id)).to include condition.id
          expect(TrackableUsage.find_by(user: user, trackable: condition)).to be_present
        end
      end
      context "already used before" do
        let!(:usage) { TrackableUsage.find_or_create_by(user: user, trackable: condition) }
        let!(:previous_count) { usage.count }
        it "adds trackable and increments count on usage record" do
          expect(subject.conditions.map(&:condition_id)).to include condition.id
          expect(usage.reload.count).to eq(previous_count + 1)
        end
      end
    end
  end

  context "trackables positions" do
    let(:n) { 5 }
    let(:trackables) do
      result = []
      n.times do |i|
        result << create(:checkin_condition, checkin: checkin, position: i)
      end
      result
    end
    let(:trackables_attrs) do
      trackables.map do |t|
        {
          id: t.id.to_s,
          condition_id: t.condition_id,
          position: t.position
        }
      end
    end

    context "when adding a trackable and client didn't pass position" do
      let(:condition) { create(:condition) }
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: trackables_attrs + [{condition_id: condition.id}]
          }
        )
      end
      it "auto-sets position to last" do
        added_trackable = subject.conditions.find_by(condition_id: condition.id)
        expect(added_trackable.position).to eq n
      end
    end

    context "when removing a trackable" do
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: trackables_attrs
          }
        )
      end
      let(:pos) { 1 }
      before do
        trackable_to_remove = params[:checkin][:conditions_attributes].find { |a| a[:position].eql? pos }
        trackable_to_remove[:_destroy] = "1"
      end
      it "updates positions of removed trackable's successors" do
        successors_attrs = params[:checkin][:conditions_attributes].select { |a| a[:position] > pos }
        successors_attrs.each do |successor_attrs|
          successor = subject.conditions.find(successor_attrs[:id])
          expect(successor.position).to eq successor_attrs[:position] - 1
        end
      end
    end

    context "when reordering trackables" do
      let(:params) do
        ActionController::Parameters.new(
          id: checkin.id.to_s,
          checkin: {
            conditions_attributes: trackables_attrs
          }
        )
      end
      before do
        # swap first and last trackable's positions
        attrs = params[:checkin][:conditions_attributes]
        attrs[0][:position] = attrs[trackables_attrs.length - 1][:position]
      end
      context "on today's checkin" do
        it "updates trackables positions in checkin and saves them in profile" do
          params[:checkin][:conditions_attributes].each do |condition_attr|
            checkin_condition = subject.conditions.find(condition_attr[:id])
            expect(checkin_condition.position).to eq condition_attr[:position]
            condition = Condition.find(condition_attr[:condition_id])
            saved_position = user.profile.most_recent_trackable_position_for(condition)
            expect(saved_position).to eq condition_attr[:position]
          end
        end
      end
      context "on a past checkin" do
        let(:checkin) { create(:checkin, user_id: user.id, date: Time.zone.today - 1.day) }

        it "updates trackables positions in checkin but doesn't save them in profile" do
          params[:checkin][:conditions_attributes].each do |condition_attr|
            checkin_condition = subject.conditions.find(condition_attr[:id])
            expect(checkin_condition.position).to eq condition_attr[:position]
            condition = Condition.find(condition_attr[:condition_id])
            saved_position = user.profile.most_recent_trackable_position_for(condition)
            expect(saved_position).to eq nil
          end
        end
      end
    end
  end

  context "trackings" do
    let(:condition) { create(:condition) }
    let(:params) do
      ActionController::Parameters.new(
        id: checkin.id.to_s,
        checkin: {
          conditions_attributes: [{condition_id: condition.id, color_id: "7"}]
        }
      )
    end

    context "when a trackable is added to a current checkin" do
      it "starts tracking it so it carries over to the next day" do
        expect(subject.conditions.map(&:condition_id)).to include condition.id

        tracking = user.trackings.find_by(trackable: condition)
        expect(tracking).to be_present
        expect(tracking.start_at).to eq checkin.date.to_date
        expect(tracking.end_at).to be_nil
        expect(tracking.color_id).to eq 7
      end

      it "prefills the next day's checkin with the added trackable" do
        subject
        next_checkin = Checkin::Creator.new(user.id, checkin.date.to_date + 1.day).create!
        expect(next_checkin.conditions.map(&:condition_id)).to include condition.id
      end
    end

    context "when the checkin's date is a day off the server's, as it is for users away from UTC" do
      let(:checkin) { create(:checkin, user_id: user.id, date: Time.zone.today + 1.day) }

      it "still starts tracking the added trackable" do
        subject
        expect(user.trackings.find_by(trackable: condition)).to be_present
      end
    end

    context "when the client has already tracked the trackable itself" do
      let!(:existing) { create(:tracking, :active, user: user, trackable: condition) }

      it "does not create a second tracking" do
        subject
        expect(user.trackings.where(trackable: condition).count).to eq 1
      end
    end

    context "when the trackable was tracked and then untracked before" do
      let!(:ended) do
        create(:tracking, user: user, trackable: condition, start_at: Time.zone.today - 7.days,
          end_at: Time.zone.today - 3.days)
      end

      it "starts tracking it again" do
        subject
        expect(user.trackings.where(trackable: condition, end_at: nil).count).to eq 1
      end
    end

    context "when a tracking starting on the checkin's date was already ended" do
      let!(:ended_today) do
        create(:tracking, user: user, trackable: condition,
          start_at: checkin.date.to_date, end_at: Time.zone.today)
      end

      it "reopens it rather than failing on the uniqueness validation" do
        expect { subject }.not_to raise_error
        expect(user.trackings.where(trackable: condition).count).to eq 1
        expect(ended_today.reload.end_at).to be_nil
      end
    end

    context "when backfilling an old checkin" do
      let(:checkin) { create(:checkin, user_id: user.id, date: Time.zone.today - 5.days) }

      it "does not change what the user tracks from here on" do
        subject
        expect(user.trackings.find_by(trackable: condition)).to be_nil
      end
    end
  end
end
